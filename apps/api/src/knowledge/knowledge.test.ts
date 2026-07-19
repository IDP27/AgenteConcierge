import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileKnowledge } from "./compile.js";
import { FileSource } from "./sources/file-source.js";
import { htmlToText } from "./sources/url-source.js";

describe("compileKnowledge", () => {
  it("gera cabeçalho com aviso e concatena artigos com origem", () => {
    const out = compileKnowledge(
      "Resort Teste",
      [
        { title: "Horários", content: "# Horários\n\nCheck-in 14h.", origin: "file:01.md" },
        { title: "Pets", content: "Aceitamos pets até 12kg.", origin: "https://ajuda.example/pets" },
      ],
      new Date("2026-07-19T12:00:00Z"),
    );

    expect(out).toContain("# Resort Teste — Base de conhecimento");
    expect(out).toContain("NÃO edite este arquivo");
    expect(out).toContain("# Horários");
    // Artigo sem heading ganha o título como seção:
    expect(out).toContain("## Pets");
    expect(out).toContain("<!-- fonte: https://ajuda.example/pets -->");
  });
});

describe("FileSource", () => {
  it("lê artigos .md ordenados; diretório ausente devolve vazio", async () => {
    const base = await mkdtemp(join(tmpdir(), "knowledge-"));
    await mkdir(join(base, "resort-1"));
    await writeFile(join(base, "resort-1", "02-b.md"), "# Segundo\n\nconteúdo");
    await writeFile(join(base, "resort-1", "01-a.md"), "# Primeiro\n\nconteúdo");
    const source = new FileSource(base);

    const articles = await source.fetchArticles("resort-1");
    expect(articles.map((a) => a.title)).toEqual(["Primeiro", "Segundo"]);

    expect(await source.fetchArticles("resort-sem-fontes")).toEqual([]);
  });
});

describe("htmlToText", () => {
  it("prefere <main>, remove script/nav e limpa tags", () => {
    const html = `<html><head><script>evil()</script></head><body>
      <nav>menu que não interessa</nav>
      <main><h1>Taxa ambiental</h1><p>R$ 8 por pessoa/dia.</p><ul><li>Item A</li></ul></main>
      <footer>rodapé</footer></body></html>`;

    const text = htmlToText(html);
    expect(text).toContain("Taxa ambiental");
    expect(text).toContain("R$ 8 por pessoa/dia.");
    expect(text).not.toContain("evil");
    expect(text).not.toContain("menu que não interessa");
    expect(text).not.toContain("<p>");
  });
});
