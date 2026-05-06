import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios, { AxiosError } from 'axios';
import * as https from 'https';
import { randomUUID } from 'crypto';
import { Like, Repository } from 'typeorm';
import { QueryTokenCatalogDto } from './dto/queryTokenCatalog.dto';
import { SetTokenCatalogDto } from './dto/setTokenCatalog.dto';
import { SyncTokenCatalogDto } from './dto/syncTokenCatalog.dto';
import {
  LITELLM_COST_MAP_URL,
  OPENROUTER_MODELS_URL,
  OpenRouterModelsResponse,
  OpenRouterModelRow,
  buildLiteLLmChatIndex,
  openRouterListToMap,
  resolveLimitsForModelId,
  resolveLimitsForModelIdFlexible,
} from './model-limits-openrouter-litellm';
import { ModelTokenCatalogEntity } from './model-token-catalog.entity';

export type SyncJobStatus = 'queued' | 'running' | 'done' | 'error';

export interface SyncJobState {
  id: string;
  status: SyncJobStatus;
  phase: string;
  /** 0–100 */
  percent: number;
  processed: number;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  openRouterModels: number;
  liteLLmChatKeys: number;
  message?: string;
  result?: {
    inserted: number;
    updated: number;
    skipped: number;
    openRouterModels: number;
    liteLLmChatKeys: number;
    totalCandidates: number;
  };
  createdAt: number;
}

@Injectable()
export class ModelTokenCatalogService {
  private readonly logger = new Logger(ModelTokenCatalogService.name);

  private readonly syncJobs = new Map<string, SyncJobState>();

  /** 同实例仅允许一个同步任务，避免内存与 DB 压力 */
  private activeSyncJobId: string | null = null;

  constructor(
    @InjectRepository(ModelTokenCatalogEntity)
    private readonly catalogRepo: Repository<ModelTokenCatalogEntity>,
  ) {}

  private createSyncHttpsAgent(): https.Agent | undefined {
    if (process.env.HOAI_SYNC_TLS_INSECURE === '1') {
      this.logger.warn(
        'HOAI_SYNC_TLS_INSECURE=1：同步外网目录时将跳过 TLS 证书校验（仅建议排障临时使用）',
      );
      return new https.Agent({ rejectUnauthorized: false });
    }
    return undefined;
  }

  private axiosSyncConfig() {
    return {
      timeout: 180000,
      httpsAgent: this.createSyncHttpsAgent(),
      validateStatus: (s: number) => s >= 200 && s < 300,
    };
  }

  private httpExceptionMessage(err: HttpException): string {
    const res = err.getResponse();
    if (typeof res === 'string') return res;
    if (res && typeof res === 'object' && 'message' in res) {
      const m = (res as { message?: string | string[] }).message;
      return Array.isArray(m) ? m.join('; ') : String(m || err.message);
    }
    return err.message;
  }

  private formatAxiosError(e: unknown): string {
    if (!axios.isAxiosError(e)) {
      return e instanceof Error ? e.message : String(e);
    }
    const ax = e as AxiosError;
    const code = ax.code || '';
    const status = ax.response?.status;
    const url = ax.config?.url || '';
    if (code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'CERT_HAS_EXPIRED') {
      return `HTTPS 证书校验失败（${code}）。可在服务器设置环境变量 HOAI_SYNC_TLS_INSECURE=1 后重试（仅用于排障），或修复系统 CA 证书。 URL: ${url}`;
    }
    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'ENOTFOUND') {
      return `网络不可达（${code}）：${url}`;
    }
    if (status) {
      return `HTTP ${status} 拉取失败：${url}`;
    }
    return ax.message || '外网请求失败';
  }

  private async fetchOpenRouterModels(): Promise<Map<string, OpenRouterModelRow>> {
    try {
      const { data } = await axios.get<OpenRouterModelsResponse>(
        OPENROUTER_MODELS_URL,
        this.axiosSyncConfig(),
      );
      return openRouterListToMap(data?.data);
    } catch (e) {
      throw new HttpException(
        `拉取 OpenRouter 模型列表失败：${this.formatAxiosError(e)}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async fetchLiteLLmJson(): Promise<Record<string, unknown>> {
    const envUrl = process.env.LITELLM_COST_MAP_URL?.trim();
    const urls = [
      envUrl,
      LITELLM_COST_MAP_URL,
      'https://cdn.jsdelivr.net/gh/BerriAI/litellm@main/model_prices_and_context_window.json',
    ].filter((u): u is string => Boolean(u));
    const tried = new Set<string>();
    let lastErr: unknown;
    for (const url of urls) {
      if (tried.has(url)) continue;
      tried.add(url);
      try {
        const { data } = await axios.get<Record<string, unknown>>(url, this.axiosSyncConfig());
        if (!data || typeof data !== 'object') {
          throw new Error('响应不是 JSON 对象');
        }
        return data;
      } catch (e) {
        lastErr = e;
        this.logger.warn(
          `LiteLLM 映射拉取失败，尝试下一镜像：${url} → ${this.formatAxiosError(e)}`,
        );
      }
    }
    throw new HttpException(
      `拉取 LiteLLM model_prices_and_context_window.json 失败（已尝试 ${
        tried.size
      } 个地址）：${this.formatAxiosError(lastErr)}`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  getSyncProgress(syncId: string): SyncJobState {
    const job = this.syncJobs.get(syncId);
    if (!job) {
      throw new HttpException('同步任务不存在或已过期', HttpStatus.NOT_FOUND);
    }
    return job;
  }

  /**
   * 启动异步同步，立即返回 syncId；前端轮询 getSyncProgress。
   */
  startSyncJob(body: SyncTokenCatalogDto): { syncId: string } {
    if (this.activeSyncJobId) {
      const j = this.syncJobs.get(this.activeSyncJobId);
      if (j && (j.status === 'queued' || j.status === 'running')) {
        throw new HttpException(
          `已有同步任务进行中（${this.activeSyncJobId}），请稍候再试`,
          HttpStatus.CONFLICT,
        );
      }
    }

    const syncId = randomUUID();
    const job: SyncJobState = {
      id: syncId,
      status: 'queued',
      phase: '排队中',
      percent: 0,
      processed: 0,
      total: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      openRouterModels: 0,
      liteLLmChatKeys: 0,
      createdAt: Date.now(),
    };
    this.syncJobs.set(syncId, job);
    this.activeSyncJobId = syncId;

    void this.runSyncJob(syncId, body || {}).catch(err => {
      this.logger.error(`同步任务异常 ${syncId}: ${err?.stack || err}`);
      const j = this.syncJobs.get(syncId);
      if (j) {
        j.status = 'error';
        j.phase = '失败';
        j.percent = 100;
        j.message =
          err instanceof HttpException
            ? this.httpExceptionMessage(err)
            : this.formatAxiosError(err);
      }
      if (this.activeSyncJobId === syncId) {
        this.activeSyncJobId = null;
      }
    });

    this.pruneOldJobs();
    return { syncId };
  }

  private pruneOldJobs() {
    const ttl = 3600_000;
    const now = Date.now();
    for (const [id, j] of this.syncJobs) {
      if (now - j.createdAt > ttl && (j.status === 'done' || j.status === 'error')) {
        this.syncJobs.delete(id);
      }
    }
  }

  private updateJob(syncId: string, patch: Partial<SyncJobState>) {
    const j = this.syncJobs.get(syncId);
    if (!j) return;
    Object.assign(j, patch);
  }

  /**
   * MySQL 批量按 modelId 唯一键写入。不用 TypeORM upsert：无自增 id 时会在非 RETURNING 驱动上触发
   * “Cannot update entity because entity id is not set in the entity.”
   */
  private async bulkUpsertTokenCatalogChunk(
    rows: Array<{
      modelId: string;
      displayName: string | null;
      maxModelTokens: number;
      max_tokens: number;
      source: string;
    }>,
  ): Promise<void> {
    if (rows.length === 0) return;
    const meta = this.catalogRepo.metadata;
    const q = (name: string) => `\`${meta.findColumnWithPropertyName(name).databaseName}\``;
    const table = `\`${meta.tablePath}\``;
    const cols = [
      q('modelId'),
      q('displayName'),
      q('maxModelTokens'),
      q('max_tokens'),
      q('source'),
      q('locked'),
      q('createdAt'),
      q('updatedAt'),
    ].join(', ');
    const placeholders = rows.map(() => '(?, ?, ?, ?, ?, 0, NOW(), NOW())').join(', ');
    const params = rows.flatMap(r => [
      r.modelId,
      r.displayName,
      r.maxModelTokens,
      r.max_tokens,
      r.source,
    ]);
    await this.catalogRepo.query(
      `INSERT INTO ${table} (${cols}) VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         ${q('displayName')} = VALUES(${q('displayName')}),
         ${q('maxModelTokens')} = VALUES(${q('maxModelTokens')}),
         ${q('max_tokens')} = VALUES(${q('max_tokens')}),
         ${q('source')} = VALUES(${q('source')}),
         ${q('updatedAt')} = NOW()`,
      params,
    );
  }

  private async runSyncJob(syncId: string, body: SyncTokenCatalogDto) {
    const scope = body.scope || 'both';
    const force = Boolean(body.force);

    this.updateJob(syncId, { status: 'running', phase: '拉取 OpenRouter / LiteLLM', percent: 5 });

    let orMap = new Map<string, OpenRouterModelRow>();
    let lmIndex = new Map<string, { input: number | null; output: number | null }>();

    if (scope === 'openrouter') {
      orMap = await this.fetchOpenRouterModels();
    } else if (scope === 'litellm') {
      const lmRoot = await this.fetchLiteLLmJson();
      lmIndex = buildLiteLLmChatIndex(lmRoot);
    } else {
      const [or, lmRoot] = await Promise.all([
        this.fetchOpenRouterModels(),
        this.fetchLiteLLmJson(),
      ]);
      orMap = or;
      lmIndex = buildLiteLLmChatIndex(lmRoot);
    }

    this.updateJob(syncId, {
      phase: '合并模型列表',
      percent: 20,
      openRouterModels: orMap.size,
      liteLLmChatKeys: lmIndex.size,
    });

    const modelIds = new Set<string>();
    orMap.forEach((_, id) => modelIds.add(id));
    lmIndex.forEach((_, id) => modelIds.add(id));

    const existingRows = await this.catalogRepo.find();
    const byModelId = new Map(existingRows.map(r => [r.modelId, r]));
    const knownModelIds = new Set(existingRows.map(r => r.modelId));

    const upsertPayloads: Array<{
      modelId: string;
      displayName: string | null;
      maxModelTokens: number;
      max_tokens: number;
      source: string;
    }> = [];

    let skipped = 0;
    for (const mid of modelIds) {
      const resolved = resolveLimitsForModelId(mid, orMap, lmIndex);
      if (!resolved) continue;

      const existing = byModelId.get(mid);
      if (existing && existing.locked && !force) {
        skipped++;
        continue;
      }

      upsertPayloads.push({
        modelId: mid,
        displayName: resolved.displayName ?? null,
        maxModelTokens: resolved.maxModelTokens,
        max_tokens: resolved.max_tokens,
        source: resolved.source,
      });
    }

    const total = upsertPayloads.length;
    this.updateJob(syncId, { total, skipped, phase: '写入数据库', percent: 25, processed: 0 });

    let inserted = 0;
    let updated = 0;
    const chunkSize = 150;
    for (let i = 0; i < upsertPayloads.length; i += chunkSize) {
      const chunk = upsertPayloads.slice(i, i + chunkSize);

      await this.bulkUpsertTokenCatalogChunk(chunk);

      for (const c of chunk) {
        if (knownModelIds.has(c.modelId)) {
          updated++;
        } else {
          inserted++;
          knownModelIds.add(c.modelId);
        }
      }

      const processed = Math.min(i + chunkSize, upsertPayloads.length);
      const pct = 25 + Math.floor((processed / Math.max(total, 1)) * 70);
      this.updateJob(syncId, { processed, percent: pct, inserted, updated });
    }

    const result = {
      inserted,
      updated,
      skipped,
      openRouterModels: orMap.size,
      liteLLmChatKeys: lmIndex.size,
      totalCandidates: modelIds.size,
    };

    this.updateJob(syncId, {
      status: 'done',
      phase: '完成',
      percent: 100,
      processed: total,
      result,
      message: undefined,
    });

    if (this.activeSyncJobId === syncId) {
      this.activeSyncJobId = null;
    }

    this.logger.log(
      `Token 目录同步完成 ${syncId}: inserted=${inserted} updated=${updated} skipped=${skipped}`,
    );
  }

  async query(params: QueryTokenCatalogDto) {
    const page = Number(params.page) > 0 ? Number(params.page) : 1;
    const size = Number(params.size) > 0 ? Number(params.size) : 20;
    const where: Record<string, unknown> = {};
    if (params.modelId) {
      where.modelId = Like(`%${params.modelId.trim()}%`);
    }
    if (params.source) {
      where.source = params.source.trim();
    }
    const [rows, count] = await this.catalogRepo.findAndCount({
      where,
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * size,
      take: size,
    });
    return { rows, count };
  }

  async set(params: SetTokenCatalogDto) {
    const modelId = params.modelId?.trim();
    if (!modelId) {
      throw new HttpException('modelId 不能为空', HttpStatus.BAD_REQUEST);
    }
    const maxModelTokens = Number(params.maxModelTokens);
    const max_tokens = Number(params.max_tokens);
    if (!Number.isFinite(maxModelTokens) || maxModelTokens <= 0) {
      throw new HttpException('上下文 Tokens 无效', HttpStatus.BAD_REQUEST);
    }
    if (!Number.isFinite(max_tokens) || max_tokens <= 0) {
      throw new HttpException('回复 Tokens 无效', HttpStatus.BAD_REQUEST);
    }

    const source = params.source?.trim() || 'manual';
    const locked = params.locked !== undefined ? Boolean(params.locked) : source === 'manual';

    if (params.id) {
      const other = await this.catalogRepo.findOne({ where: { modelId } });
      if (other && other.id !== params.id) {
        throw new HttpException(`模型 ID 已被其它记录使用：${modelId}`, HttpStatus.BAD_REQUEST);
      }
      await this.catalogRepo.update(
        { id: params.id },
        {
          modelId,
          displayName: params.displayName ?? null,
          maxModelTokens,
          max_tokens,
          source,
          locked,
          remark: params.remark ?? null,
        },
      );
      return true;
    }

    const exists = await this.catalogRepo.findOne({ where: { modelId } });
    if (exists) {
      throw new HttpException(`模型 ID 已存在：${modelId}`, HttpStatus.BAD_REQUEST);
    }

    await this.catalogRepo.save({
      modelId,
      displayName: params.displayName ?? null,
      maxModelTokens,
      max_tokens,
      source,
      locked,
      remark: params.remark ?? null,
    });
    return true;
  }

  async delete(id: number) {
    if (!id) {
      throw new HttpException('缺少 id', HttpStatus.BAD_REQUEST);
    }
    await this.catalogRepo.softDelete({ id });
    return true;
  }

  /** 维护表：精确 modelId，或仅填短名时按「以 /短名 结尾」匹配（多命中时优先 openai/ 与更短路径） */
  private async findCatalogRowFlexible(mid: string): Promise<ModelTokenCatalogEntity | null> {
    const exact = await this.catalogRepo.findOne({ where: { modelId: mid } });
    if (exact) return exact;

    if (!mid.includes('/')) {
      const suf = `/${mid}`;
      const n = suf.length;
      const rows = await this.catalogRepo
        .createQueryBuilder('c')
        .where('RIGHT(c.modelId, :n) = :suf', { n, suf })
        .getMany();
      if (rows.length === 0) return null;
      rows.sort((a, b) => {
        const ap = a.modelId.startsWith('openai/') ? 0 : 1;
        const bp = b.modelId.startsWith('openai/') ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return a.modelId.length - b.modelId.length;
      });
      return rows[0];
    }
    return null;
  }

  async lookup(modelId: string) {
    const mid = modelId?.trim();
    if (!mid) {
      throw new HttpException('modelId 不能为空', HttpStatus.BAD_REQUEST);
    }

    const row = await this.findCatalogRowFlexible(mid);
    if (row) {
      return {
        found: true,
        fromCatalog: true,
        matchedModelId: row.modelId,
        maxModelTokens: row.maxModelTokens,
        max_tokens: row.max_tokens,
        source: row.source,
        displayName: row.displayName,
        locked: row.locked,
      };
    }

    try {
      const [orMap, lmRoot] = await Promise.all([
        this.fetchOpenRouterModels(),
        this.fetchLiteLLmJson(),
      ]);
      const lmIndex = buildLiteLLmChatIndex(lmRoot);
      const flex = resolveLimitsForModelIdFlexible(mid, orMap, lmIndex);
      if (!flex) {
        return {
          found: false,
          fromCatalog: false,
          matchedModelId: null,
          maxModelTokens: null,
          max_tokens: null,
          source: null,
        };
      }
      return {
        found: true,
        fromCatalog: false,
        matchedModelId: flex.matchedModelId,
        maxModelTokens: flex.limits.maxModelTokens,
        max_tokens: flex.limits.max_tokens,
        source: flex.limits.source,
        displayName: flex.limits.displayName ?? null,
      };
    } catch (e) {
      this.logger.warn(
        `lookup 解析失败 modelId=${mid}: ${
          e instanceof HttpException ? this.httpExceptionMessage(e) : this.formatAxiosError(e)
        }`,
      );
      return {
        found: false,
        fromCatalog: false,
        matchedModelId: null,
        maxModelTokens: null,
        max_tokens: null,
        source: null,
      };
    }
  }
}
