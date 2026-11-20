import { MAP_HEIGHT, MAP_WIDTH, project, strandPath } from './strand-map';

describe('the strand map’s projection', () => {
  it('puts the north at the top and the west on the left', () => {
    const berlin = project(52.52, 13.4);
    const roma = project(41.9, 12.5);
    const paris = project(48.86, 2.35);
    expect(berlin.y).toBeLessThan(roma.y);
    expect(paris.x).toBeLessThan(berlin.x);
    for (const point of [berlin, roma, paris]) {
      expect(point.edge).toBe(false);
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(MAP_WIDTH);
      expect(point.y).toBeGreaterThan(0);
      expect(point.y).toBeLessThan(MAP_HEIGHT);
    }
  });

  it('puts a far place on the nearest edge', () => {
    const us = project(39.83, -98.58);
    expect(us.edge).toBe(true);
    expect(us.x).toBe(project(45, -11).x);
  });

  it('draws a strand as one gentle curve between two places', () => {
    const path = strandPath({ x: 10, y: 10, edge: false }, { x: 110, y: 10, edge: false });
    expect(path).toMatch(/^M10 10 Q60 32 110 10$/);
  });
});
