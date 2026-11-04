/** Small line + word diff for comparing an original text with a proposed revision (no dependency). */

export type Segment = { type: "equal" | "del" | "ins"; text: string };
export type LinePair = { left: Segment[] | null; right: Segment[] | null; changed: boolean };

function lcs<T>(a: T[], b: T[]): [number, number][] {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs: [number, number][] = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/** Word-level segments of one line against another. */
export function wordDiff(before: string, after: string): { left: Segment[]; right: Segment[] } {
  const a = before.split(/(\s+)/), b = after.split(/(\s+)/);
  const left: Segment[] = [], right: Segment[] = [];
  const push = (list: Segment[], type: Segment["type"], text: string) => {
    const last = list[list.length - 1];
    if (last && last.type === type) last.text += text; else list.push({ type, text });
  };
  let i = 0, j = 0;
  for (const [pi, pj] of [...lcs(a, b), [a.length, b.length] as [number, number]]) {
    while (i < pi) push(left, "del", a[i++]);
    while (j < pj) push(right, "ins", b[j++]);
    if (pi < a.length) { push(left, "equal", a[pi]); push(right, "equal", b[pj]); i++; j++; }
  }
  return { left, right };
}

/** Lines aligned side by side; changed pairs carry word-level highlights. */
export function sideBySide(original: string, proposed: string): LinePair[] {
  const a = original.split("\n"), b = proposed.split("\n");
  const out: LinePair[] = [];
  let i = 0, j = 0;
  for (const [pi, pj] of [...lcs(a, b), [a.length, b.length] as [number, number]]) {
    // Unmatched lines between anchors: pair them up as edits, the rest as pure deletions/insertions.
    while (i < pi || j < pj) {
      if (i < pi && j < pj) {
        const { left, right } = wordDiff(a[i++], b[j++]);
        out.push({ left, right, changed: true });
      } else if (i < pi) out.push({ left: [{ type: "del", text: a[i++] }], right: null, changed: true });
      else out.push({ left: null, right: [{ type: "ins", text: b[j++] }], changed: true });
    }
    if (pi < a.length) { out.push({ left: [{ type: "equal", text: a[pi] }], right: [{ type: "equal", text: b[pj] }], changed: false }); i++; j++; }
  }
  return out;
}
