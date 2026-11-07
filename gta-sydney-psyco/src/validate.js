export function isSourcedHarbour(data) {
  if (!data || data.synthetic === true) return false;
  if (data.meta?.source !== 'OpenStreetMap') return false;
  if (!data.meta?.attribution || !String(data.meta.attribution).includes('OpenStreetMap')) return false;
  if (!Array.isArray(data.water) || data.water.length === 0) return false;
  if (!data.bridge?.points || data.bridge.points.length < 2) return false;
  if (!data.landmarks?.operaHouse?.parts?.length) return false;
  if (!Array.isArray(data.roads) || data.roads.length < 10) return false;
  if (!data.mission?.checkpoints || data.mission.checkpoints.length < 4) return false;
  if (!data.mission.spawn) return false;
  if (!data.bounds) return false;
  return true;
}

export function sourcedProblems(data) {
  const problems = [];
  if (!data) return ['missing data'];
  if (data.synthetic === true) problems.push('flagged synthetic');
  if (data.meta?.source !== 'OpenStreetMap') problems.push('source is not OpenStreetMap');
  if (!String(data.meta?.attribution || '').includes('OpenStreetMap')) problems.push('missing OpenStreetMap attribution');
  if (!data.water?.length) problems.push('no water rings');
  if (!data.bridge?.points || data.bridge.points.length < 2) problems.push('no harbour bridge centerline');
  if (!data.landmarks?.operaHouse?.parts?.length) problems.push('no Opera House footprint');
  if (!data.roads || data.roads.length < 10) problems.push('too few roads');
  if (!data.mission?.checkpoints || data.mission.checkpoints.length < 4) problems.push('mission is incomplete');
  if (!data.mission?.spawn) problems.push('missing spawn');
  if (!data.bounds) problems.push('missing bounds');
  return problems;
}
