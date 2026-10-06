// Clawd for the terminal: 16 x 16 pixels, drawn in the palette of the widget's pixel model (`PIXEL_PAL.clawd`
// in app/src/renderer/models/pixel.ts) and packed two pixel rows to a terminal row.
export type PetState = 'idle' | 'thinking' | 'working' | 'waiting' | 'done' | 'error' | 'sleeping'

export const COLS = 16
export const ROWS = 8
const PIXEL_ROWS = ROWS * 2

const PALETTE: Record<string, number> = {
  k: 0x2b1d16,
  m: 0xd97757,
  s: 0xb25d3d,
  h: 0xf2ae92,
  e: 0x1e1410,
  w: 0xffffff,
  x: 0xf0997b,
}
// The terminal's own colour, for a pixel that is not drawn.
const DEFAULT = 0x01000000

// The body: 12 wide, 8 tall, corners cut, a highlight row on top and a shade row below.
const SHELL = [
  '...kkkkkkkkkk...',
  '..kmhhhhhhhhmk..',
  '..kmmmmmmmmmmk..',
  '..kmmmmmmmmmmk..',
  '..kmmmmmmmmmmk..',
  '..kmxmmmmmmxmk..',
  '..kssssssssssk..',
  '...kkkkkkkkkk...',
]
const TOP = 6
const EYE_COLS = [5, 10]
const LEG_COLS = [4, 6, 9, 11]
// A glyph is rows of palette letters, '.' being nothing.
const QUESTION = ['mmm', '..m', '.m.', '...', '.m.']
const BANG = ['s', 's', 's', '.', 's']
const ZED = ['mmm', '.m.', 'mmm']

type Eyes = 'open' | 'up' | 'closed' | 'cross' | 'happy'
type Pose = {
  dy?: number
  eyes?: Eyes
  mouth?: boolean
  // Where an arm hangs: -2 raised high, -1 raised, 0 level with the eyes, 1 low.
  armL?: number
  armR?: number
  glyphs?: [row: number, col: number, rows: string[]][]
}

const stamp = (grid: string[][], row: number, col: number, rows: string[]) =>
  rows.forEach((line, i) =>
    Array.from(line).forEach((ch, j) => {
      if (ch !== '.' && grid[row + i]?.[col + j] !== undefined) grid[row + i]![col + j] = ch
    }),
  )

const eyePixels = (eyes: Eyes, col: number): [row: number, col: number][] => {
  switch (eyes) {
    case 'open':
      return [[3, col], [4, col]]
    case 'up':
      return [[2, col], [3, col]]
    case 'closed':
      return col > 7 ? [[4, col], [4, col + 1]] : [[4, col - 1], [4, col]]
    case 'cross':
      return [[2, col - 1], [2, col + 1], [3, col], [4, col - 1], [4, col + 1]]
    case 'happy':
      return [[3, col], [4, col - 1], [4, col + 1]]
  }
}

function pose({ dy = 0, eyes = 'open', mouth = true, armL = 0, armR = 0, glyphs = [] }: Pose): string[] {
  const grid = Array.from({ length: PIXEL_ROWS }, () => Array<string>(COLS).fill('.'))
  const top = TOP + dy
  // legs first: the body hides their tops
  for (const col of LEG_COLS) for (let row = top + SHELL.length; row < PIXEL_ROWS; row++) grid[row]![col] = 's'
  stamp(grid, top, 0, SHELL)
  const arm = (outer: number, inner: number, cap: number, hang: number) => {
    const at = top + 3 + hang
    stamp(grid, at, outer, ['k'])
    stamp(grid, at + 1, outer, ['k'])
    stamp(grid, at, inner, ['m'])
    stamp(grid, at + 1, inner, ['m'])
    stamp(grid, at - 1, cap, ['k'])
    stamp(grid, at + 2, cap, ['k'])
  }
  arm(0, 1, 1, armL)
  arm(15, 14, 14, armR)
  for (const col of EYE_COLS) for (const [row, c] of eyePixels(eyes, col)) stamp(grid, top + row, c, ['e'])
  if (mouth) stamp(grid, top + 5, 7, ['ee'])
  for (const [row, col, rows] of glyphs) stamp(grid, row, col, rows)
  return grid.map(row => row.join(''))
}

// One to three dots, a pixel apart, above the head.
const dots = (n: number): [number, number, string[]][] => [[4, 9, ['m.m.m'.slice(0, 2 * n - 1)]]]

export const FRAMES: Record<PetState, string[][]> = {
  idle: [pose({}), pose({ dy: 1 }), pose({}), pose({ eyes: 'closed', mouth: false })],
  thinking: [1, 2, 3, 2].map(n => pose({ eyes: 'up', mouth: false, glyphs: dots(n) })),
  working: [
    pose({ armL: -1, armR: 1 }),
    pose({ armL: 0, armR: 0 }),
    pose({ armL: 1, armR: -1 }),
    pose({ armL: 0, armR: 0 }),
  ],
  waiting: [
    pose({ glyphs: [[0, 7, QUESTION]] }),
    pose({ dy: 1, glyphs: [[1, 7, QUESTION]] }),
  ],
  done: [-1, -2, -1, -2].map(armR => pose({ eyes: 'happy', mouth: false, armR })),
  error: [
    pose({ eyes: 'cross', mouth: false, glyphs: [[0, 7, BANG]] }),
    pose({ eyes: 'cross', mouth: false, dy: 1 }),
  ],
  sleeping: [
    pose({ dy: 1, eyes: 'closed', mouth: false, glyphs: [[2, 11, ZED]] }),
    pose({ dy: 1, eyes: 'closed', mouth: false, glyphs: [[1, 12, ZED]] }),
    pose({ dy: 0, eyes: 'closed', mouth: false, glyphs: [[0, 13, ZED]] }),
    pose({ dy: 0, eyes: 'closed', mouth: false, glyphs: [[0, 13, ZED]] }),
  ],
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Standard padded base64; written out so nothing depends on the runtime having `btoa` or `Buffer`.
function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? B64[n & 63]! : '='
  }
  return out
}

const colourOf = (letter: string | undefined): number | undefined => (letter === undefined || letter === '.' ? undefined : PALETTE[letter])

/**
 * A frame as `RasterProps.cells`: per terminal cell `[code point, foreground, background]` as little-endian u32,
 * two pixel rows to a cell. A cell shows its top pixel as the foreground of `▀` and its bottom pixel as the background;
 * a half that is not drawn is the terminal's default colour, which is why a lone bottom pixel is a `▄` (the foreground of
 * `▀` is the text colour, not transparent) and a cell with neither is a space.
 */
export function encode(frame: string[]): string {
  const view = new DataView(new ArrayBuffer(COLS * ROWS * 12))
  let at = 0
  const put = (code: number, fg: number, bg: number) => {
    view.setUint32(at, code, true)
    view.setUint32(at + 4, fg, true)
    view.setUint32(at + 8, bg, true)
    at += 12
  }
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const top = colourOf(frame[row * 2]?.[col])
      const bottom = colourOf(frame[row * 2 + 1]?.[col])
      if (top !== undefined) put(0x2580, top, bottom ?? DEFAULT)
      else if (bottom !== undefined) put(0x2584, bottom, DEFAULT)
      else put(0x20, DEFAULT, DEFAULT)
    }
  }
  return base64(new Uint8Array(view.buffer))
}
