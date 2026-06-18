#!/usr/bin/env node
/**
 * 音乐功能 API 冒烟测试（真实上游 suno-music / ephone）
 * 用法: node scripts/music-api-smoke.mjs
 */
const BASE = process.env.MUSIC_API_BASE || 'https://ai.hubopenai.com/api'
const USER = process.env.MUSIC_TEST_USER || 'super'
const PASS = process.env.MUSIC_TEST_PASS || 'a11111111'
const MODEL = 'suno-music'

const results = []

function log(msg) {
  console.log(msg)
}

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  })
  const j = await res.json()
  if (!j?.data) throw new Error('login failed')
  return j.data
}

async function api(token, path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text.slice(0, 200) }
  }
  return { status: res.status, body }
}

function unwrap(body) {
  return body?.data ?? body
}

function clipCountFromGenerate(data) {
  const d = unwrap(data)
  if (Array.isArray(d?.clips)) return d.clips.length
  if (d?.clips) return 1
  return 0
}

async function pollFeedDual(token, placeholderId, maxRounds = 20, intervalMs = 6000) {
  let lastCount = 0
  let lastIds = []
  for (let i = 1; i <= maxRounds; i++) {
    await new Promise(r => setTimeout(r, intervalMs))
    const { body } = await api(token, `/music/suno/feed/${placeholderId}?model=${MODEL}`)
    const data = unwrap(body)
    const list = Array.isArray(data) ? data : data ? [data] : []
    lastCount = list.length
    lastIds = list.map(c => String(c.id || ''))
    const statuses = list.map(c => `${String(c.id || '').slice(0, 8)}:${c.status || c.state}`)
    log(`  poll ${i}: count=${lastCount} [${statuses.join(', ')}]`)
    if (lastCount >= 2 && list.every(c => ['complete', 'completed', 'success', 'succeeded'].includes(String(c.status || c.state || '').toLowerCase()))) {
      return { ok: true, count: lastCount, ids: lastIds }
    }
    if (lastCount >= 2 && list.every(c => c.audio_url)) {
      return { ok: true, count: lastCount, ids: lastIds }
    }
  }
  return { ok: false, count: lastCount, ids: lastIds }
}

async function testGenerate(token, name, payload) {
  const { status, body } = await api(token, '/music/suno/generate', {
    method: 'POST',
    body: JSON.stringify({ model: MODEL, payload, chargeMult: 1 }),
  })
  if (status !== 200 || !body?.success) {
    record(name, false, `HTTP ${status} ${body?.message || ''}`)
    return null
  }
  const initial = clipCountFromGenerate(body)
  const d = unwrap(body)
  const firstId = d?.clips?.[0]?.id || d?.task_id || ''
  record(`${name}·提交`, true, `初始 clips=${initial} id=${String(firstId).slice(0, 8)}`)
  if (!firstId) return null
  const polled = await pollFeedDual(token, firstId, 18, 5000)
  record(
    `${name}·双曲目轮询`,
    polled.ok && polled.count >= 2,
    polled.ok ? `2首完成 ids=${polled.ids.join(',')}` : `仅 ${polled.count} 首 ids=${polled.ids.join(',')}`
  )
  return polled.ok ? polled.ids[0] : firstId
}

async function main() {
  log('=== 音乐 API 冒烟测试 ===\n')
  let token
  try {
    token = await login()
    record('登录', true)
  } catch (e) {
    record('登录', false, String(e))
    process.exit(1)
  }

  // 1. 创作·灵感
  const inspireClip = await testGenerate(token, '创作·灵感', {
    gpt_description_prompt: '轻快乐器流行，适合清晨',
    mv: 'chirp-fenix',
    make_instrumental: false,
  })

  // 2. 创作·纯音乐灵感
  await testGenerate(token, '创作·纯音乐灵感', {
    gpt_description_prompt: 'ambient piano calm',
    mv: 'chirp-fenix',
    prompt: '',
    make_instrumental: true,
  })

  // 3. 创作·自定义
  await testGenerate(token, '创作·自定义', {
    prompt: '[Verse]\nTest lyrics line\n[Chorus]\nSing along',
    tags: 'pop acoustic',
    title: 'CustomTest',
    mv: 'chirp-fenix',
    make_instrumental: false,
  })

  // 4. 上传（用 URL 模式，避免大文件）
  const uploadUrl = process.env.MUSIC_TEST_UPLOAD_URL || ''
  if (uploadUrl) {
    const { status, body } = await api(token, `/music/suno/upload/url?model=${MODEL}`, {
      method: 'POST',
      body: JSON.stringify({ url: uploadUrl }),
    })
    const clipId = unwrap(body)?.id || unwrap(body)?.clip_id || ''
    record('工具·上传URL', status === 200 && Boolean(clipId), clipId ? clipId.slice(0, 12) : body?.message)
  } else {
    record('工具·上传URL', true, '跳过（未设 MUSIC_TEST_UPLOAD_URL）')
  }

  // 5. Cover（需要已完成 clip）
  let coverSource = inspireClip
  if (coverSource) {
    await testGenerate(token, '编辑·Cover翻唱', {
      task: 'cover',
      mv: 'chirp-fenix',
      title: 'CoverSmoke',
      tags: 'pop',
      prompt: '[Instrumental]',
      cover_clip_id: coverSource,
      audio_weight: 0.5,
    })
  } else {
    record('编辑·Cover翻唱', false, '无可用源曲')
  }

  // 6. Feed 静默（record not found 不应 502）
  const { status, body } = await api(
    token,
    `/music/suno/feed/00000000-0000-4000-8000-000000000099?model=${MODEL}`
  )
  const feedData = unwrap(body)
  const feedOk = status === 200 && (Array.isArray(feedData) ? feedData.length === 0 : true)
  record('Feed·无效ID软返回', feedOk, `HTTP ${status}`)

  // 7. 云端任务列表
  const jobs = await api(token, '/music/suno/jobs?limit=5')
  record('云端任务列表', jobs.status === 200 && jobs.body?.success !== false, `HTTP ${jobs.status}`)

  // 8. 歌词提交
  const lyrics = await api(token, '/music/suno/lyrics/submit', {
    method: 'POST',
    body: JSON.stringify({ model: MODEL, prompt: '夏日海边' }),
  })
  const taskId = unwrap(lyrics.body)?.task_id || ''
  record('工具·歌词生成提交', lyrics.status === 200 && Boolean(taskId), taskId ? taskId.slice(0, 12) : '')

  log('\n=== 汇总 ===')
  const passed = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok)
  log(`通过 ${passed}/${results.length}`)
  if (failed.length) {
    log('失败项:')
    for (const f of failed) log(`  - ${f.name}: ${f.detail}`)
    process.exit(1)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
