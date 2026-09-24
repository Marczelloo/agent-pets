import { tauriBridge } from './stage/bridge';
import { startStage } from './stage/stage';

startStage(document.getElementById('stage') as HTMLCanvasElement, tauriBridge());
