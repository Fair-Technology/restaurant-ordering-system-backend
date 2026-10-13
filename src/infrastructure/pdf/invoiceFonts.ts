import { readFileSync } from 'fs';
import * as path from 'path';
import * as fontkit from '@pdf-lib/fontkit';
import type { Coverage } from './textRuns';

export type FaceName = 'latin' | 'latinBold' | 'cjk';

export interface FontFace extends Coverage {
  name: FaceName;
  postscriptName: 'NotoSans-Regular' | 'NotoSans-Bold' | 'NotoSansCJKsc-Regular';
  bytes: Buffer;
}

/** Repo-root assets/fonts; same depth from src/ (tests) and dist/ (Functions). */
export const FONTS_DIR = path.join(__dirname, '../../../assets/fonts');

const FILES: Record<FaceName, { file: string; postscriptName: FontFace['postscriptName'] }> = {
  latin: { file: 'NotoSans-Regular.ttf', postscriptName: 'NotoSans-Regular' },
  latinBold: { file: 'NotoSans-Bold.ttf', postscriptName: 'NotoSans-Bold' },
  cjk: { file: 'NotoSansCJKsc-Regular.otf', postscriptName: 'NotoSansCJKsc-Regular' },
};

const cache = new Map<FaceName, FontFace>();

/** Reads the file and builds its coverage set on first call; cached per process afterwards. */
export function loadFace(name: FaceName): FontFace {
  const hit = cache.get(name);
  if (hit) return hit;
  const { file, postscriptName } = FILES[name];
  const bytes = readFileSync(path.join(FONTS_DIR, file));
  const set = new Set<number>(fontkit.create(bytes).characterSet);
  const face: FontFace = { name, postscriptName, bytes, covers: (cp) => set.has(cp) };
  cache.set(name, face);
  return face;
}
