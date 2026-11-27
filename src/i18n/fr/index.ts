import { app } from './app';
import { sidebar } from './sidebar';
import { sonde } from './sonde';
import { charts } from './charts';
import { map } from './map';
import { lib } from './lib';
import { atmo3d } from './atmo3d';
import { whatsNew } from './whatsNew';
import { features } from './features';

export const fr = { ...app, ...sidebar, ...sonde, ...charts, ...map, ...lib, ...atmo3d, ...whatsNew, ...features };
