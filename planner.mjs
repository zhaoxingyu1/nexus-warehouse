import { performance } from 'node:perf_hooks';

const key = ([x, y]) => `${x},${y}`;
const distance = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

export function planRoute({ width, height, blocked = [], start, goal }) {
  const started = performance.now();
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 100000) throw new Error('INVALID_MAP');
  const valid = p => Array.isArray(p) && p.length === 2 && p.every(Number.isInteger) && p[0] >= 0 && p[0] < width && p[1] >= 0 && p[1] < height;
  if (!valid(start) || !valid(goal) || !blocked.every(valid)) throw new Error('INVALID_COORDINATE');
  const walls = new Set(blocked.map(key));
  const result = (status, nodes = [], expanded = 0) => ({ status, nodes, length: Math.max(0, nodes.length - 1), expanded, calculationMs: performance.now() - started });
  if (walls.has(key(start)) || walls.has(key(goal))) return result('blocked_endpoint');
  const open = [{ point: start, g: 0, f: distance(start, goal) }];
  const costs = new Map([[key(start), 0]]), parents = new Map();
  let expanded = 0;
  while (open.length) {
    open.sort((a, b) => a.f - b.f || a.g - b.g || key(a.point).localeCompare(key(b.point)));
    const current = open.shift();
    if (current.g !== costs.get(key(current.point))) continue;
    expanded++;
    if (key(current.point) === key(goal)) {
      const nodes = [goal];
      while (parents.has(key(nodes[0]))) nodes.unshift(parents.get(key(nodes[0])));
      return result('found', nodes, expanded);
    }
    const [x, y] = current.point;
    for (const next of [[x + 1, y], [x, y + 1], [x - 1, y], [x, y - 1]]) {
      if (!valid(next) || walls.has(key(next))) continue;
      const g = current.g + 1;
      if (g >= (costs.get(key(next)) ?? Infinity)) continue;
      costs.set(key(next), g);
      parents.set(key(next), current.point);
      open.push({ point: next, g, f: g + distance(next, goal) });
    }
  }
  return result('unreachable', [], expanded);
}

export function selectRobot({ map, robots, pickup, destination, reserveBattery = 15, batteryPerCell = 0.25 }) {
  if (!Number.isFinite(reserveBattery) || reserveBattery < 0 || !Number.isFinite(batteryPerCell) || batteryPerCell <= 0) throw new Error('INVALID_ENERGY_MODEL');
  const loaded = planRoute({ ...map, start: pickup, goal: destination });
  const candidates = robots.map(robot => {
    const reject = reason => ({ id: robot.id, eligible: false, reason });
    if (robot.state !== 'idle') return reject('设备非空闲');
    if (!Number.isFinite(robot.battery) || robot.battery < 0 || robot.battery > 100 || !Number.isFinite(robot.speed) || robot.speed <= 0) return reject('设备遥测无效');
    if (loaded.status !== 'found') return reject('运输目标不可达');
    const approach = planRoute({ ...map, start: robot.position, goal: pickup });
    if (approach.status !== 'found') return reject('取货点不可达');
    const length = approach.length + loaded.length;
    const remainingBattery = robot.battery - length * batteryPerCell;
    if (remainingBattery < reserveBattery) return reject('任务后电量低于保留阈值');
    const etaSeconds = length / robot.speed;
    const score = etaSeconds + (100 - remainingBattery) * 0.1;
    return { id: robot.id, eligible: true, score, etaSeconds, remainingBattery, approach, loaded, reason: '行驶耗时与剩余电量综合成本' };
  });
  const eligible = candidates.filter(c => c.eligible).sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  return { selected: eligible[0] ?? null, candidates, policy: 'travel-time-plus-energy-v1' };
}
