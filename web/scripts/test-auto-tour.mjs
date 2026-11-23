import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PerspectiveCamera, Vector3 } from 'three';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, cacheDir: '.cache/vite-auto-tour-test', server: { middlewareMode: true, ws: false }, appType: 'custom' });
try {
  const campus = JSON.parse(await readFile(new URL('../public/data/campus.json', import.meta.url)));
  const paths = JSON.parse(await readFile(new URL('../public/data/paths.json', import.meta.url)));
  const { AUTO_TOUR_ROUTE_LENGTH, AUTO_TOUR_HATCH, AUTO_TOUR_FIRST_FLIGHT, AUTO_TOUR_LANDING, AUTO_TOUR_NEST, AUTO_TOUR_RETURN, AUTO_TOUR_ROAD_END, AUTO_TOUR_STOPS, autoTourChapter, autoTourGrowth, autoTourPosition } = await server.ssrLoadModule('/src/features/tour/autoTour.ts');
  const { AUTO_TOUR_HIGHLIGHTS, AUTO_TOUR_LENGTH, autoTourElapsedAt, autoTourFrame, frameHighlight, highlightView } = await server.ssrLoadModule('/src/features/tour/autoTourHighlights.ts');
  const { buildingElevation } = await server.ssrLoadModule('/src/features/tour/elevationLevels.ts');
  const { tourElevation } = await server.ssrLoadModule('/src/features/tour/terrain.ts');
  const { buildExteriorSpec, onEdge } = await server.ssrLoadModule('/src/scene/tour/exteriorSpec.ts');
  const { tourFieldFootprint } = await server.ssrLoadModule('/src/features/tour/fieldWalk.ts');
  const { mainEntryLocal } = await server.ssrLoadModule('/src/features/tour/mainEntrance.ts');
  const { SCIENCE_SIDE_ROAD } = await server.ssrLoadModule('/src/features/tour/southLink.ts');
  const { RODEM_ENTRY_DOOR, RODEM_ENTRY_STOP, rodemEntryPoint } = await server.ssrLoadModule('/src/features/tour/rodemEntrance.ts');
  const { MUSIC_FIELD_DOOR, musicFieldEntryPoint } = await server.ssrLoadModule('/src/features/tour/musicForecourt.ts');
  const { VISION_ENTRY_DOOR, VISION_ENTRY_STOP, visionEntryPoint } = await server.ssrLoadModule('/src/features/tour/visionEntrance.ts');
  const { tourPlaceGoal, tourPlaceLookAt } = await server.ssrLoadModule('/src/features/tour/buildingAccess.ts');
  const { buildTourNetwork, inside, segmentDistance, tourPath } = await server.ssrLoadModule('/src/features/tour/network.ts');
  const { buildRoadLayout, inSurface } = await server.ssrLoadModule('/src/scene/tour/roadLayout.ts');
  const { useTourStore } = await server.ssrLoadModule('/src/store/useTourStore.ts');

  const field = tourFieldFootprint(campus.outdoor_areas.find(area => area.kind === 'field'));
  const centralParking = campus.outdoor_areas.find(area => area.id === 'parking_834838406');
  const southParking = campus.outdoor_areas.find(area => area.id === 'parking_970298858');
  const network = buildTourNetwork(campus, paths);
  const { asphalt, sidewalks } = buildRoadLayout(campus, network.corridors);
  const elevation = tourElevation(campus);
  const buildings = campus.buildings.map(building => ({ building, spec: buildExteriorSpec(building) }));
  const floors = buildings.flatMap(({ building, spec }) => spec.levels.map(floor => ({
    outline: floor.outline, roof: buildingElevation(building.id) + (floor.level + 1) * building.floor_height,
  })));
  const main = buildings.find(({ building }) => building.id === 'main').spec;
  const { building: rodem, spec: rodemExterior } = buildings.find(({ building }) => building.id === 'rodem');
  const connectingRoof = rodemExterior.roofs.find(roof => roof.angle > 1);
  assert(inside([connectingRoof.x, connectingRoof.z], rodem.footprint), 'Rodem connector roof is over the building');
  const eastEave = [connectingRoof.x + connectingRoof.width / 2 * Math.sin(connectingRoof.angle), connectingRoof.z];
  assert(Math.min(...rodem.footprint.map((point, i) => segmentDistance(eastEave, point, rodem.footprint[(i + 1) % rodem.footprint.length]))) < 1.6,
    'Rodem east eave follows the outside wall');
  const { edge, t } = rodemExterior.entrance;
  assert(edge.nx > 0.98 && Math.hypot(...onEdge(edge, t).map((v, i) => v - RODEM_ENTRY_DOOR[i])) < 0.001, 'Rodem entrance faces the road at the marked recess');
  assert.deepEqual(tourPlaceLookAt(rodem), RODEM_ENTRY_DOOR);
  assert.deepEqual(tourPlaceGoal(rodem), RODEM_ENTRY_STOP);
  assert.deepEqual(tourPath(network, network.start, RODEM_ENTRY_STOP).slice(-4), [
    'tour_rodem_entry_road', 'tour_rodem_entry_sidewalk', 'tour_rodem_entry_ramp', 'tour_rodem_entry_door',
  ]);
  for (const side of [-1.4, 0, 1.4]) {
    let prior = buildingElevation('rodem');
    for (let distance = 0.25; distance <= 22; distance += 0.25) {
      const point = rodemEntryPoint(distance, side);
      assert(inSurface(point, sidewalks) && !inSurface(point, asphalt), 'The Rodem path meets the sidewalk before the carriageway');
      const y = elevation(...point);
      assert(Math.abs(y - prior) < 0.04, 'The Rodem path has a continuous grade from the entrance');
      prior = y;
    }
  }
  const { spec: musicExterior } = buildings.find(({ building }) => building.id === 'music');
  assert.deepEqual(onEdge(musicExterior.musicFieldFront, 0.5), MUSIC_FIELD_DOOR, 'The field-side Music Hall entrance sits in the center of its facade');
  for (const x of [-18, -5, 10, 25, 39]) {
    const wallZ = 12.3 + (8.11 - 12.3) * (x + 21.13) / 62.73;
    for (const z of [-5.2, 1, wallZ - 0.2]) {
      assert(inSurface([x, z], sidewalks) && !inSurface([x, z], asphalt), 'The paved frontage extends from the sidewalk to Music Hall');
    }
  }
  for (const point of [[44, -4], [45, 0], [44, 6]]) assert(!inSurface(point, sidewalks) && !inSurface(point, asphalt), 'The lawn outside the marked edge stays green');
  assert.deepEqual(tourPath(network, network.start, musicFieldEntryPoint(3.5)).slice(-3), [
    'tour_music_field_road', 'tour_music_field_sidewalk', 'tour_music_field_door',
  ]);
  const { building: vision, spec: visionExterior } = buildings.find(({ building }) => building.id === 'vision');
  assert.deepEqual(onEdge(visionExterior.entrance.edge, visionExterior.entrance.t), VISION_ENTRY_DOOR, 'Vision Hall uses the marked roadside entrance');
  assert.deepEqual(tourPlaceLookAt(vision), VISION_ENTRY_DOOR);
  assert.deepEqual(tourPlaceGoal(vision), VISION_ENTRY_STOP);
  assert.deepEqual(tourPath(network, network.start, VISION_ENTRY_STOP).slice(-2), ['tour_vision_entry_road', 'tour_vision_entry_door']);
  for (const side of [-2.35, 0, 2.35]) for (const distance of [0.1, 0.6, 1.2, 1.9, 2.55]) {
    const point = visionEntryPoint(distance, side);
    assert(inSurface(point, sidewalks) && !inSurface(point, asphalt), 'The Vision Hall entrance paving meets the sidewalk without extending into the road');
    assert(Math.abs(elevation(...point) - buildingElevation('vision')) < 0.01, 'The Vision Hall entrance has a level approach');
  }
  const science = campus.buildings.find(building => building.id === 'science');
  for (const z of [167, 169, 171, 173, 174.5]) {
    const i = SCIENCE_SIDE_ROAD.findIndex(point => point[1] > z);
    const [a, b] = [SCIENCE_SIDE_ROAD[i - 1], SCIENCE_SIDE_ROAD[i]];
    const center = a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]);
    assert(inSurface([center - 3, z], asphalt), 'Science-side road keeps a full lane beside the building');
    assert(inSurface([center - 4.25, z], sidewalks), 'A continuous sidewalk separates the Science Hall corner from the road');
    assert(science.footprint.every((point, index) => segmentDistance([center, z], point, science.footprint[(index + 1) % science.footprint.length]) > 5.5));
  }
  assert(network.nodes.tour_student_union_sidewalk?.neighbors.length === 2, 'Student Union entry stays connected to the road');
  const [nestX, nestY, nestZ] = AUTO_TOUR_NEST;
  const nestLocal = mainEntryLocal(nestX, nestZ);
  assert(main.stone.some(({ p, s }) => {
    const center = mainEntryLocal(p[0], p[2]);
    const top = buildingElevation('main') + p[1] + s[1] / 2;
    return Math.abs(top - nestY) < 0.01 && Math.abs(center.u - nestLocal.u) < s[0] / 2 && Math.abs(center.v - nestLocal.v) < s[2] / 2;
  }), 'The nest sits on the modeled roof beside the cross');
  const bird = new Vector3(), camera = new Vector3();
  let lowRoadFlight = false;
  let parkingCenterDistance = Infinity;
  for (let frame = 0; frame <= AUTO_TOUR_ROUTE_LENGTH * 20; frame++) {
    const time = frame / 20;
    autoTourPosition(time, 1, bird);
    autoTourPosition(time, 2, camera);
    assert(bird.distanceTo(camera) > 3, `Camera clearance at ${time}s`);
    if (time >= AUTO_TOUR_STOPS.gate && time <= AUTO_TOUR_ROAD_END) {
      assert(inSurface([bird.x, bird.z], asphalt), `The eagle stays over the rendered road at ${time}s`);
    }
    if (time >= AUTO_TOUR_STOPS.visionCenter && time < AUTO_TOUR_STOPS.rodem && bird.x < 25) {
      const [x, z] = centralParking.center;
      parkingCenterDistance = Math.min(parkingCenterDistance, Math.hypot(bird.x - x, bird.z - z));
      assert(bird.z <= z + 4, 'Turn toward Rodem at the middle of the central parking lot');
    }
    if (time >= AUTO_TOUR_STOPS.theology && time < AUTO_TOUR_STOPS.rodemReturn) {
      assert(!inside([bird.x, bird.z], southParking.footprint), 'Use the frontage roads without entering south parking');
    }
    for (const point of [bird, camera]) {
      const xy = [point.x, point.z];
      const height = point.y - elevation(point.x, point.z);
      assert(height > 1, `Terrain clearance at ${time}s`);
      assert(floors.every(floor => point.y > floor.roof + 0.5 || !inside(xy, floor.outline)), `Building clearance at ${time}s`);
      const fenceClearance = Math.min(...field.map((start, index) => segmentDistance(xy, start, field[(index + 1) % field.length])));
      assert(height > 6.25 || fenceClearance > 1, `Field fence clearance at ${time}s`);
      if (point === bird && time >= AUTO_TOUR_STOPS.field && time < AUTO_TOUR_STOPS.main) {
        assert(!inside(xy, field), 'Return alongside the field, outside its fence');
        if (height < 10 && point.z > -117 && point.z < -28) lowRoadFlight = true;
      }
    }
  }
  assert(lowRoadFlight, 'The eagle flies low along the road beside the field');
  assert(parkingCenterDistance < 2, 'Show Vision Center from the middle of the central parking lot');
  assert.deepEqual([autoTourPosition(0, 1, bird).x, bird.z], [AUTO_TOUR_NEST[0], AUTO_TOUR_NEST[2]]);
  assert(bird.distanceTo(autoTourPosition(AUTO_TOUR_ROUTE_LENGTH, 1, new Vector3())) < 3, 'Landing returns to the nest');
  assert(autoTourPosition(0, 2, camera).equals(autoTourPosition(AUTO_TOUR_ROUTE_LENGTH, 2, new Vector3())), 'Final shot reprises opening camera');
  const stages = [AUTO_TOUR_HATCH + 1, 17, 55, AUTO_TOUR_LANDING].map(autoTourGrowth);
  assert(stages.every(({ size, wingLength }, index) => !index || (size > stages[index - 1].size && wingLength > stages[index - 1].wingLength)));
  assert(autoTourGrowth(AUTO_TOUR_FIRST_FLIGHT - 0.1).grounded && !autoTourGrowth(AUTO_TOUR_FIRST_FLIGHT).grounded);

  const stopTimes = Object.values(AUTO_TOUR_STOPS);
  assert(stopTimes.every((time, i) => i === 0 || time > stopTimes[i - 1]), 'Landmark times are in playback order');
  assert.deepEqual(stopTimes.map(time => autoTourChapter(time).place), [
    '정문', '대학원관', '디자인관', 'GEMI관', '음악관', '영산비전센터', '로뎀관', '학생회관',
    '신학관', '이공관', '비전관', '로뎀관', '운동장 옆 도로', '본관',
  ]);
  const landmarks = ['graduate', 'design', 'gemi', 'music', 'vision_center', 'rodem', 'student_union', 'theology', 'science', 'vision', 'rodem'];
  for (const [index, id] of landmarks.entries()) {
    const building = campus.buildings.find(building => building.id === id);
    const [x, z] = building.center;
    let closest = Infinity;
    for (let time = stopTimes[index + 1]; time < stopTimes[index + 2]; time += 0.25) {
      autoTourPosition(time, 1, bird);
      closest = Math.min(closest, Math.hypot(bird.x - x, bird.z - z));
    }
    if (['graduate', 'design', 'gemi'].includes(id)) {
      const roof = buildingElevation(id) + building.levels * building.floor_height;
      assert(autoTourPosition(stopTimes[index + 1] + 1, 2, camera).y > roof + 3, `${building.name} is framed above roof level`);
    }
    assert(closest < (id === 'vision_center' ? 75 : 45), `${building.name} is shown during its chapter`);
  }
  const gate = campus.outdoor_areas.find(area => area.id === 'gate_main');
  const gateStart = autoTourPosition(AUTO_TOUR_STOPS.gate, 1, new Vector3());
  assert(Math.hypot(gateStart.x - gate.center[0], gateStart.z - gate.center[1]) < 6, 'Fly through the main gate after hatching');
  const { climb, panorama, dive, pullOut } = AUTO_TOUR_RETURN;
  const aboveRodem = autoTourPosition(climb, 1, new Vector3());
  const overview = autoTourPosition(panorama + 1, 1, new Vector3());
  const diveStart = autoTourPosition(dive, 1, new Vector3());
  const diveEnd = autoTourPosition(pullOut, 1, new Vector3());
  assert(overview.y - aboveRodem.y > 95, 'Climb from Rodem Hall to the campus overview');
  assert(Math.abs(diveStart.y - overview.y) < 10, 'Maintain altitude briefly for the wide shot');
  assert(diveStart.y - diveEnd.y > 110 && diveStart.z - diveEnd.z > 70, 'Dive forward onto the field-side road');

  assert.deepEqual(AUTO_TOUR_HIGHLIGHTS.map(shot => shot.id).sort(), campus.buildings.map(building => building.id).sort(), 'Every campus building has one highlight');
  assert(AUTO_TOUR_LENGTH < 150, 'Presentation playback finishes within two and a half minutes');
  assert.equal(autoTourElapsedAt(AUTO_TOUR_FIRST_FLIGHT), AUTO_TOUR_FIRST_FLIGHT, 'Hatching and takeoff keep their original pacing');
  assert(Math.abs(autoTourElapsedAt(dive) - autoTourElapsedAt(panorama) - (dive - panorama)) < 0.001, 'The panorama retains its viewing time');
  assert(Math.abs(AUTO_TOUR_LENGTH - autoTourElapsedAt(AUTO_TOUR_LANDING) - (AUTO_TOUR_ROUTE_LENGTH - AUTO_TOUR_LANDING)) < 0.001, 'The post-landing shot retains its viewing time');
  assert(autoTourElapsedAt(28) - autoTourElapsedAt(17) < (28 - 17) / 1.6, 'The eagle flies faster along the approach road');
  for (let routeTime = 0; routeTime <= AUTO_TOUR_ROUTE_LENGTH; routeTime += 0.25) {
    assert(Math.abs(autoTourFrame(autoTourElapsedAt(routeTime)).routeTime - routeTime) < 0.001, 'Preload and playback times use the same flight timing');
  }
  let lastRouteTime = 0;
  for (let frame = 0; frame <= AUTO_TOUR_LENGTH * 20; frame++) {
    const { routeTime } = autoTourFrame(frame / 20);
    assert(routeTime >= lastRouteTime, 'Highlights keep the flight timeline moving forward');
    lastRouteTime = routeTime;
  }
  assert.equal(lastRouteTime, AUTO_TOUR_ROUTE_LENGTH, 'All flight scenes play through to the original landing');
  const shotCamera = new PerspectiveCamera(49, 16 / 9, 0.12, 1700);
  const scratch = new Vector3();
  for (const shot of AUTO_TOUR_HIGHLIGHTS) {
    const building = campus.buildings.find(building => building.id === shot.id);
    const { routeTime, highlight, caption } = autoTourFrame(shot.start + 2);
    assert.equal(highlight?.id, building.id);
    assert.equal(routeTime, shot.at);
    assert.equal(caption, 1);
    assert.equal(autoTourFrame(shot.start + 3.7).highlight?.id, building.id, 'Building introductions retain their display time');
    const view = highlightView(shot, building);
    for (const aspect of [16 / 9, 4 / 3, 9 / 16]) {
      shotCamera.aspect = aspect;
      for (const progress of [0, 0.5, 1]) {
        frameHighlight(shotCamera, view, progress, scratch);
        for (const point of view.outlinePoints) {
          scratch.copy(point).project(shotCamera);
          assert(Math.abs(scratch.x) < 0.81 && Math.abs(scratch.y) < 0.77 && Math.abs(scratch.z) < 1, `${building.name} stays fully in the shot`);
        }
      }
    }
  }

  useTourStore.setState({ active: true, view: 'flight', nodeId: 'prior-node' });
  const controls = useTourStore.getState();
  controls.startAuto();
  controls.updateAutoTime(0, 4.5);
  controls.toggleAutoPause();
  controls.updateAutoTime(0, 5);
  assert.equal(useTourStore.getState().auto.seconds, 4.5, 'Pause keeps the caption and playback in place');
  controls.restartAuto();
  controls.updateAutoTime(0, 9);
  assert.equal(useTourStore.getState().auto.seconds, 0, 'Restart discards frames from the prior run');
  controls.updateAutoTime(1, AUTO_TOUR_LENGTH);
  assert.equal(useTourStore.getState().auto.phase, 'finished');
  controls.exitAuto();
  assert.equal(useTourStore.getState().view, 'flight');
  assert.equal(useTourStore.getState().nodeId, 'prior-node');
  console.log('Auto tour path, growth, and playback checks passed.');
} finally {
  await server.close();
}
