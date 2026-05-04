import { warmupAll, getStations, getFountains, getGreenSpaces } from './src/services/madridData.js';

async function test() {
  console.log('Testing madridData local file loading...');
  await warmupAll();
  
  const stations = getStations();
  const fountains = getFountains();
  const greenSpaces = getGreenSpaces();

  console.log('--- Results ---');
  console.log(`Stations: ${stations.length}`);
  console.log(`Fountains: ${fountains.length}`);
  console.log(`Green Spaces: ${greenSpaces.length}`);
  
  if (stations.length === 0 || fountains.length === 0 || greenSpaces.length === 0) {
    console.error('ERROR: Some data failed to load from local files!');
    process.exit(1);
  } else {
    console.log('SUCCESS: All local static data loaded correctly!');
    process.exit(0);
  }
}

test();
