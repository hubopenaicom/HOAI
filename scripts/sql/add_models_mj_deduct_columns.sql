-- Midjourney 三档扣费（models 表）。生产环境 synchronize=false 时请手动执行一次。
ALTER TABLE `models`
  ADD COLUMN `deductMjRelax` DOUBLE NULL COMMENT 'MJ慢速(relax)单次扣除，空则同deduct' AFTER `deduct`,
  ADD COLUMN `deductMjFast` DOUBLE NULL COMMENT 'MJ快速(fast)单次扣除，空则同deduct' AFTER `deductMjRelax`,
  ADD COLUMN `deductMjTurbo` DOUBLE NULL COMMENT 'MJ极速(turbo)单次扣除，空则同deduct' AFTER `deductMjFast`;
