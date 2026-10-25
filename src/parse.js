// Deterministic ranking-text parser. Turns pasted text such as
//   Top 5 Most Powerful Superheroes
//   5. Spider-Man
//   4. Iron Man ...
// into { title, entries: [{ rank, text }], notes: [{ level, text }] }. No network, no AI.

const KEYCAPS = { '🔟': 10 };
const RANK_WORDS = /\b(top|best|worst|most|least|ranking|ranked|rank|tier|greatest|biggest|favorite|favourite|countdown)\b/i;

// Each pattern captures (number, text). Order matters: most specific first.
const ITEM_PATTERNS = [
  /^(\d{1,3})️?⃣\s*(.*)$/, // 5️⃣ Spider-Man
  /^(?:no\.?|number|rank|place)\s*#?\s*(\d{1,3})\b\s*[.):\-–—|]?\s*(.*)$/i, // No. 5 Spider-Man, Rank 5: X
  /^#\s*(\d{1,3})\b\s*[.):\-–—|]?\s*(.*)$/, // #5 Spider-Man, #5. X
  /^[([](\d{1,3})[)\]]\s*[.:\-–—]?\s*(.*)$/, // (5) X, [5] X
  /^(\d{1,3})(?:st|nd|rd|th)(?:\s+place)?\s*[.):\-–—|]\s*(.*)$/i, // 5th: X, 1st place - X
  /^(\d{1,3})\s*(?:[.)\]:|]|[-–—](?=\s))(?!\d)\s*(.*)$/, // 5. X, 5) X, 5: X, 5 - X
];

function cleanLine(line) {
  return line
    .replace(/\*\*|__|`/g, '') // markdown emphasis
    .replace(/^\s*(?:[•·▪►▶➤>*]|[-–—](?=\s))\s*/, '') // bullets (but not a leading "-5")
    .replace(/\s+/g, ' ')
    .trim();
}

function matchItem(line) {
  for (const k of Object.keys(KEYCAPS)) {
    if (line.startsWith(k)) return { rank: KEYCAPS[k], text: line.slice(k.length).trim() };
  }
  for (const re of ITEM_PATTERNS) {
    const m = line.match(re);
    if (m) return { rank: Number(m[1]), text: m[2].replace(/^[.):\-–—|\s]+/, '').trim() };
  }
  return null;
}

// "1. Thor 2. Hulk 3. Loki" pasted on one line -> three lines.
function splitInlineList(line) {
  const hits = line.match(/(?:^|\s)\d{1,3}[.)]\s+\S/g);
  if (!hits || hits.length < 2) return [line];
  return line.split(/\s+(?=\d{1,3}[.)]\s+\S)/);
}

const topN = (title) => {
  const m = title.match(/\btop\s*(\d{1,3})\b/i);
  return m ? Number(m[1]) : null;
};

const isTitleish = (line) => RANK_WORDS.test(line) || /:\s*$/.test(line);

export function parseRanking(raw, direction = 'down') {
  const notes = [];
  const lines = String(raw || '')
    .split(/\r?\n/)
    .flatMap(splitInlineList)
    .map(cleanLine)
    .filter(Boolean);
  if (!lines.length) return { title: '', entries: [], notes };

  const items = lines.map(matchItem);
  const firstItem = items.findIndex(Boolean);
  let title = '';
  let entries = [];
  let numbered = true;

  if (firstItem >= 0) {
    title = lines.slice(0, firstItem).join(' ');
    const ignored = [];
    lines.forEach((line, i) => {
      if (i < firstItem) return;
      if (items[i]) entries.push(items[i]);
      else ignored.push(line);
    });
    if (ignored.length) notes.push({ level: 'info', text: `Ignored ${ignored.length} un-numbered line${ignored.length > 1 ? 's' : ''} inside the list: “${ignored[0]}”${ignored.length > 1 ? '…' : ''}` });
  } else {
    // No numbers anywhere: one entry per line, first line is the heading when it reads like one.
    numbered = false;
    const n = topN(lines[0]);
    if (lines.length > 1 && (isTitleish(lines[0]) || n === lines.length - 1)) {
      title = lines[0];
      entries = lines.slice(1).map((text) => ({ text }));
    } else {
      entries = lines.map((text) => ({ text }));
      if (lines.length > 1) notes.push({ level: 'warn', text: 'No main title recognised. Add a first line like “Top 5 …” or type it in the Main title box.' });
    }
  }

  title = title.replace(/[:\-–—]\s*$/, '').trim();
  const N = entries.length;

  if (!numbered) {
    entries.forEach((e, i) => (e.rank = direction === 'down' ? N - i : i + 1));
    if (N) notes.push({ level: 'info', text: `No numbers found, so entries were numbered ${direction === 'down' ? `${N} → 1` : `1 → ${N}`} in the order you wrote them.` });
  } else {
    const nums = entries.map((e) => e.rank);
    const unique = new Set(nums).size === N;
    const consecutiveUp = nums.every((v, i) => i === 0 || v === nums[i - 1] + 1);
    const want = topN(title) ?? N;
    // Editors auto-increment numbered lists, turning "5. 4. 3." into "5. 6. 7.": treat that as a countdown.
    if (N > 1 && consecutiveUp && nums[0] > 1 && nums[0] === want) {
      entries.forEach((e, i) => (e.rank = nums[0] - i));
      notes.push({ level: 'warn', text: `Numbers ran ${nums[0]}, ${nums[1]}, ${nums[2] ?? '…'} (looks auto-numbered), so they were read as a countdown ${nums[0]} → ${nums[0] - N + 1}. Fix below if that's wrong.` });
    } else if (!unique) {
      const down = nums[0] >= N;
      entries.forEach((e, i) => (e.rank = down ? N - i : i + 1));
      notes.push({ level: 'warn', text: `Some rank numbers repeat, so entries were renumbered ${down ? `${N} → 1` : `1 → ${N}`} by position. Fix below if that's wrong.` });
    }
  }

  const empty = entries.filter((e) => !e.text).length;
  if (empty) notes.push({ level: 'warn', text: `${empty} entr${empty > 1 ? 'ies have' : 'y has'} a number but no title.` });
  const n = topN(title);
  if (n && n !== N) notes.push({ level: 'warn', text: `The title says Top ${n} but ${N} entr${N === 1 ? 'y was' : 'ies were'} found.` });

  return { title, entries: entries.map(({ rank, text }) => ({ rank, text })), notes };
}

// Canonical text form; parseRanking(serializeRanking(x)) gives back x.
export function serializeRanking({ title, entries }) {
  const list = entries.map((e) => `${e.rank}. ${e.text}`.trimEnd()).join('\n');
  return title ? (list ? `${title}\n\n${list}` : title) : list;
}

export const renumber = (entries, direction) => entries.map((e, i) => ({ ...e, rank: direction === 'down' ? entries.length - i : i + 1 }));

// The preview redraws every frame, so keep the last parse around.
let cache = { key: null, value: null };
export function parsedFor(script) {
  const key = `${script.direction}\u0000${script.text}`;
  if (cache.key !== key) cache = { key, value: parseRanking(script.text, script.direction) };
  return cache.value;
}

export const EXAMPLE = `Top 5 Most Powerful Superheroes

5. Spider-Man
4. Iron Man
3. Thor
2. Hulk
1. Superman`;
