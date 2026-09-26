import { tauriBridge } from './stage/bridge';
import { startStage } from './stage/stage';
import { blockContextMenu } from './stage/nocontext';

blockContextMenu(window);

startStage(document.getElementById('stage') as HTMLCanvasElement, tauriBridge());
