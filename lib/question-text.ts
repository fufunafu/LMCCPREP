/** Readable equivalents of delimited clinical math, matching the native renderer. */
export function readableQuestionText(value: string): string {
  const text = value.replace(/<br\s*\/?>/gi, "\n");
  return text.replace(/\$\$([\s\S]*?)\$\$|(?<!\\)\$([^$\n]+?)(?<!\\)\$|\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g, (full, display, inline, round, square) => {
    const body = display ?? inline ?? round ?? square;
    if (inline !== undefined && !/[\\^_<>=%]|^[\d.\s+*/()−-]+$|^[A-Za-z]{1,8}$/.test(body)) return full;
    let index = 0;
    const symbols: Record<string, string> = { circ: "°", times: "×", cdot: "·", pm: "±", approx: "≈", ge: "≥", geq: "≥", le: "≤", leq: "≤", ne: "≠", neq: "≠", lt: "<", gt: ">", rightarrow: "→", to: "→", leftarrow: "←", uparrow: "↑", downarrow: "↓", propto: "∝", sim: "∼", mu: "μ", alpha: "α", beta: "β", gamma: "γ", delta: "δ", Delta: "Δ", sigma: "σ", epsilon: "ε", varepsilon: "ε", theta: "θ", pi: "π", lambda: "λ", infty: "∞" };
    const argument = (): string => {
      while (/\s/.test(body[index] ?? "") && index < body.length) index++;
      const c = body[index++];
      if (!c) return "";
      return c === "{" ? parse("}") : c === "\\" ? command() : c;
    };
    const command = (): string => {
      const start = index;
      while (/[a-z]/i.test(body[index] ?? "") && index < body.length) index++;
      if (index === start) { const symbol = body[index++] ?? "\\"; return [",", ";", " ", ":"].includes(symbol) ? " " : symbol; }
      const name = body.slice(start, index);
      if (["text", "mathrm", "mathbf", "operatorname"].includes(name)) return argument();
      if (["frac", "dfrac", "tfrac"].includes(name)) return `(${argument()})/(${argument()})`;
      if (name === "sqrt") return `√(${argument()})`;
      if (name === "bar") return argument() + "\u0304";
      if (name === "left" || name === "right") return "";
      return symbols[name] ?? `\\${name}`;
    };
    const parse = (closing?: string): string => {
      let output = "";
      while (index < body.length) {
        const c = body[index++];
        if (c === closing) break;
        if (c === "\\") output += command();
        else if (c === "{") output += parse("}");
        else if (c === "^" || c === "_") {
          const content = argument(); const plain = "0123456789+-=()ni"; const script = c === "^" ? "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱ" : "₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₙᵢ";
          output += content === "°" ? content : content && [...content].every((c) => plain.includes(c)) ? [...content].map((c) => script[plain.indexOf(c)]).join("") : `${c}(${content})`;
        } else output += c;
      }
      return output;
    };
    return parse().trim();
  });
}
