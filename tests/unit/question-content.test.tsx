import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuestionContent } from "@/components/question-content";

const laboratoryTable = `**Laboratory investigations:**
| Test | Result | Normal Range |
|---|---|---|
| Serum Calcium (Total) | 3.2 mmol/L | 2.2–2.6 mmol/L |
| Parathyroid Hormone (PTH) | 1.0 pmol/L | 1.6–6.9 pmol/L |
| Serum Creatinine | 80 µmol/L | 50–90 µmol/L |
| Albumin | 38 g/L | 35–50 g/L |
| 24-hour Urinary Calcium | 10 mmol/day | 2.5–7.5 mmol/day |

---

A chest CT scan reveals a 3 cm spiculated mass in the left upper lobe of the lung.`;

describe("QuestionContent", () => {
  it("renders the reported Q17921 table without changing its values or units", () => {
    const html = renderToStaticMarkup(<QuestionContent text={laboratoryTable} />);
    expect(html).toContain("<strong>Laboratory investigations:</strong>");
    expect(html).toContain("<table");
    expect(html.match(/<th scope="col"/g)).toHaveLength(3);
    expect(html.match(/<td /g)).toHaveLength(15);
    for (const value of ["3.2 mmol/L", "2.2–2.6 mmol/L", "1.0 pmol/L", "1.6–6.9 pmol/L", "80 µmol/L", "50–90 µmol/L", "38 g/L", "35–50 g/L", "10 mmol/day", "2.5–7.5 mmol/day"]) expect(html).toContain(value);
    expect(html).toContain('aria-label="Scrollable clinical data table"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("<hr");
    expect(html).toContain("A chest CT scan reveals a 3 cm spiculated mass");
    expect(html).not.toContain("|---|");
    expect(html).not.toContain("**");
  });

  it("preserves ordered and nested lists and ordinary clinical comparisons", () => {
    const html = renderToStaticMarkup(<QuestionContent text={"### Findings\n\n3. First group\n   - **Nested finding**\n   - BP < 90 mmHg\n4. Next group\n\nCosts $20 and $30."} />);
    expect(html).toContain("<h3");
    expect(html).toContain('<ol start="3"');
    expect(html).toContain("<ul");
    expect(html).toContain("<strong>Nested finding</strong>");
    expect(html).toContain("BP &lt; 90 mmHg");
    expect(html).toContain("Costs $20 and $30.");
  });

  it("does not execute embedded HTML or unsafe link targets", () => {
    const html = renderToStaticMarkup(<QuestionContent text={'<script>alert(1)</script>\n\n[unsafe](javascript:alert%281%29)\n\n<img src=x onerror=alert(1)>'} />);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onerror");
    expect(html).toContain("unsafe");
  });
});
