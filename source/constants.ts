import * as path from 'node:path';
import {fixPathForAsarUnpack} from 'electron-util';

export const caprineIconPath = fixPathForAsarUnpack(path.join(__dirname, '..', 'static', 'Icon.png'));
export const caprineBlueIconPath = path.join(__dirname, '..', 'static', 'IconAppBlue.png');
export const caprineBlueIcoPath = fixPathForAsarUnpack(path.join(__dirname, '..', 'static', 'IconAppBlue.ico'));
