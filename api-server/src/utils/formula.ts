/* Autor: Simon Cebula – Anpassung für die K.D.St.V. Sauerlandia */

// Kleiner Formel-Rechner für die Excel-Bilanz der Bierkasse. Excel speichert berechnete Werte nur,
// wenn die Datei in Excel neu berechnet wurde – bei der Bilanz ist das oft nicht der Fall. Deshalb
// werden die Formeln hier selbst ausgewertet. Unterstützt nur, was die Bilanz braucht:
// Zahlen, + - * /, Klammern, Zellbezüge (auch 'Blatt'!A1 und Bereiche), SUM, ROUND, SUMIF.
// Alles andere bricht mit einer Fehlermeldung ab, statt zu raten.

export interface RawCell {
  value: number | string | boolean | null; // fester Wert (bei Formeln ignoriert)
  formula: string | null; // ohne führendes "="
}

export interface CellSource {
  cell(sheet: string, address: string): RawCell;
}

export class FormulaError extends Error {}

type Value = number | string | Value[];

interface Token {
  type: 'num' | 'str' | 'ref' | 'func' | 'op' | '(' | ')' | ',';
  text: string;
}

const REF = /^(?:(?:'((?:[^']|'')+)'|([A-Za-z0-9_.ÄÖÜäöüß]+))!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/;

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let rest = formula.trim();
  while (rest.length) {
    const space = /^\s+/.exec(rest);
    if (space) {
      rest = rest.slice(space[0].length);
      continue;
    }
    const num = /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest);
    const func = /^([A-Z][A-Z0-9.]*)\(/.exec(rest);
    const ref = REF.exec(rest);
    if (rest[0] === '"') {
      const end = rest.indexOf('"', 1);
      if (end < 0) throw new FormulaError(`Unvollständige Zeichenkette in „=${formula}“`);
      tokens.push({ type: 'str', text: rest.slice(1, end) });
      rest = rest.slice(end + 1);
    } else if (func) {
      tokens.push({ type: 'func', text: func[1] });
      rest = rest.slice(func[1].length);
    } else if (ref) {
      tokens.push({ type: 'ref', text: ref[0] });
      rest = rest.slice(ref[0].length);
    } else if (num) {
      tokens.push({ type: 'num', text: num[0] });
      rest = rest.slice(num[0].length);
    } else if ('+-*/'.includes(rest[0])) {
      tokens.push({ type: 'op', text: rest[0] });
      rest = rest.slice(1);
    } else if ('(),;'.includes(rest[0])) {
      tokens.push({ type: rest[0] === ';' ? ',' : (rest[0] as '(' | ')' | ','), text: rest[0] });
      rest = rest.slice(1);
    } else {
      throw new FormulaError(`Unbekanntes Zeichen „${rest[0]}“ in „=${formula}“`);
    }
  }
  return tokens;
}

function columnNumber(letters: string): number {
  return [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
}

export function columnLetters(n: number): string {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const toNumber = (v: Value): number => (typeof v === 'number' ? v : 0);
const flatten = (v: Value): Value[] => (Array.isArray(v) ? v.flatMap(flatten) : [v]);

function matchesCriterion(value: Value, criterion: string): boolean {
  const m = /^(>=|<=|<>|>|<|=)?(.*)$/.exec(criterion)!;
  const op = m[1] ?? '=';
  const target = Number(m[2].replace(',', '.'));
  if (typeof value !== 'number' || !Number.isFinite(target)) {
    return op === '=' ? String(value) === m[2] : op === '<>' ? String(value) !== m[2] : false;
  }
  switch (op) {
    case '>=':
      return value >= target;
    case '<=':
      return value <= target;
    case '>':
      return value > target;
    case '<':
      return value < target;
    case '<>':
      return value !== target;
    default:
      return value === target;
  }
}

// Excel rundet kaufmännisch (0,5 weg von null)
function excelRound(value: number, digits: number): number {
  const factor = 10 ** digits;
  return (Math.sign(value) * Math.round(Math.abs(value) * factor + 1e-9)) / factor;
}

interface ParserHooks {
  reference(text: string): Value;
  call(name: string, args: Value[], fail: (message: string) => never): Value;
}

// Rekursiver Abstieg: Ausdruck = Term (+|- Term)*, Term = Faktor (*|/ Faktor)*, Faktor = -Faktor | Wert
class Parser {
  private pos = 0;

  constructor(
    private tokens: Token[],
    private formula: string,
    private where: string,
    private hooks: ParserHooks
  ) {}

  parse(): Value {
    const result = this.expression();
    if (this.pos < this.tokens.length) this.fail(`Unerwartetes „${this.tokens[this.pos].text}“`);
    return result;
  }

  private fail = (message: string): never => {
    throw new FormulaError(`${this.where}: ${message} in „=${this.formula}“`);
  };

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token | undefined {
    return this.tokens[this.pos++];
  }

  private isOp(ops: string): boolean {
    const token = this.peek();
    return token?.type === 'op' && ops.includes(token.text);
  }

  private expression(): Value {
    let left = this.term();
    while (this.isOp('+-')) {
      const op = this.next()!.text;
      const right = this.term();
      left = op === '+' ? toNumber(left) + toNumber(right) : toNumber(left) - toNumber(right);
    }
    return left;
  }

  private term(): Value {
    let left = this.unary();
    while (this.isOp('*/')) {
      const op = this.next()!.text;
      const right = this.unary();
      if (op === '/' && toNumber(right) === 0) this.fail('Division durch 0');
      left = op === '*' ? toNumber(left) * toNumber(right) : toNumber(left) / toNumber(right);
    }
    return left;
  }

  private unary(): Value {
    if (this.isOp('+-')) {
      const op = this.next()!.text;
      const v = this.unary();
      return op === '-' ? -toNumber(v) : toNumber(v);
    }
    return this.primary();
  }

  private primary(): Value {
    const token = this.next();
    if (!token) return this.fail('Formel endet unerwartet');
    switch (token.type) {
      case 'num':
        return Number(token.text);
      case 'str':
        return token.text;
      case 'ref':
        return this.hooks.reference(token.text);
      case '(': {
        const v = this.expression();
        if (this.next()?.type !== ')') this.fail('Klammer fehlt');
        return v;
      }
      case 'func': {
        if (this.next()?.type !== '(') this.fail('Klammer fehlt');
        const args: Value[] = [];
        if (this.peek()?.type !== ')') {
          args.push(this.expression());
          while (this.peek()?.type === ',') {
            this.next();
            args.push(this.expression());
          }
        }
        if (this.next()?.type !== ')') this.fail('Klammer fehlt');
        return this.hooks.call(token.text, args, this.fail);
      }
      default:
        return this.fail(`Unerwartetes „${token.text}“`);
    }
  }
}

export class FormulaEvaluator {
  private cache = new Map<string, Value>();
  private active = new Set<string>();

  constructor(private source: CellSource) {}

  // Wert einer Zelle: Formel ausgewertet, Text bleibt Text, leer = 0
  value(sheet: string, address: string): number | string {
    const v = this.cellValue(sheet, address.replace(/\$/g, ''));
    return Array.isArray(v) ? toNumber(flatten(v)[0] ?? 0) : v;
  }

  number(sheet: string, address: string): number {
    return toNumber(this.value(sheet, address));
  }

  evaluate(sheet: string, formula: string, where = sheet): Value {
    return new Parser(tokenize(formula), formula, where, {
      reference: text => this.reference(sheet, text),
      call: (name, args, fail) => this.call(name, args, fail)
    }).parse();
  }

  private cellValue(sheet: string, address: string): Value {
    const key = `${sheet}!${address}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    if (this.active.has(key)) throw new FormulaError(`Zirkelbezug bei ${key}`);
    this.active.add(key);
    try {
      const raw = this.source.cell(sheet, address);
      let result: Value;
      if (raw.formula) {
        result = this.evaluate(sheet, raw.formula, key);
      } else if (typeof raw.value === 'number') {
        result = raw.value;
      } else if (typeof raw.value === 'string') {
        result = raw.value.trim() === '' ? 0 : raw.value;
      } else {
        result = 0;
      }
      this.cache.set(key, result);
      return result;
    } finally {
      this.active.delete(key);
    }
  }

  private reference(currentSheet: string, text: string): Value {
    const m = REF.exec(text)!;
    const sheet = m[1] ? m[1].replace(/''/g, `'`) : (m[2] ?? currentSheet);
    if (!m[5]) return this.cellValue(sheet, `${m[3]}${m[4]}`);
    const [c1, c2] = [columnNumber(m[3]), columnNumber(m[5])].sort((a, b) => a - b);
    const [r1, r2] = [Number(m[4]), Number(m[6])].sort((a, b) => a - b);
    const values: Value[] = [];
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) values.push(this.cellValue(sheet, `${columnLetters(c)}${r}`));
    }
    return values;
  }

  private call(name: string, args: Value[], fail: (message: string) => never): Value {
    switch (name) {
      case 'SUM':
        return args.flatMap(flatten).reduce<number>((sum, v) => sum + toNumber(v), 0);
      case 'ROUND':
        if (args.length !== 2) fail('ROUND braucht zwei Argumente');
        return excelRound(toNumber(args[0]), toNumber(args[1]));
      case 'SUMIF': {
        if (args.length < 2 || args.length > 3) fail('SUMIF braucht zwei oder drei Argumente');
        const range = flatten(args[0]);
        const sums = args[2] === undefined ? range : flatten(args[2]);
        const criterion = String(args[1]);
        return range.reduce<number>((sum, v, i) => sum + (matchesCriterion(v, criterion) ? toNumber(sums[i]) : 0), 0);
      }
      default:
        return fail(`Funktion ${name} wird nicht unterstützt`);
    }
  }
}
