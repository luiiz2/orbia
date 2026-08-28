"""Gera o relatorio de auditoria de seguranca do Orbia.

Uso local:
  python gerar_relatorio.py

O documento e deliberadamente baseado em evidencias estaticas registradas
abaixo. Nenhum segredo e incluido no relatorio.
"""

from __future__ import annotations

from datetime import date
from html import escape
from pathlib import Path
import textwrap

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    HRFlowable,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Preformatted,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.graphics.charts.piecharts import Pie
from reportlab.graphics.shapes import Circle, Drawing, Rect, String


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs" / "security-audit" / "relatorio-auditoria-seguranca.pdf"
PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 2 * cm

SEVERITY_COLORS = {
    "Critica": "#B91C1C",
    "Alta": "#EA580C",
    "Media": "#D97706",
    "Baixa": "#2563EB",
    "Forca": "#059669",
}


def install_fonts() -> tuple[str, str, str]:
    """Use fontes locais quando disponiveis para preservar acentos no PDF."""

    candidates = [
        (Path("C:/Windows/Fonts/segoeui.ttf"), Path("C:/Windows/Fonts/segoeuib.ttf"), Path("C:/Windows/Fonts/consola.ttf")),
        (Path("C:/Windows/Fonts/arial.ttf"), Path("C:/Windows/Fonts/arialbd.ttf"), Path("C:/Windows/Fonts/consola.ttf")),
    ]
    for regular, bold, mono in candidates:
        if regular.exists() and bold.exists() and mono.exists():
            pdfmetrics.registerFont(TTFont("AuditSans", str(regular)))
            pdfmetrics.registerFont(TTFont("AuditSans-Bold", str(bold)))
            pdfmetrics.registerFont(TTFont("AuditMono", str(mono)))
            return "AuditSans", "AuditSans-Bold", "AuditMono"
    return "Helvetica", "Helvetica-Bold", "Courier"


FONT, FONT_BOLD, FONT_MONO = install_fonts()


def finding(
    identifier: str,
    severity: str,
    category: str,
    title: str,
    summary: str,
    exploitability: str,
    impact: str,
    protection: str,
    recommendation: str,
    evidence: list[tuple[str, str]],
    issue_title: str,
    issue_labels: str,
    issue_fix: str,
    issue_acceptance: list[str],
) -> dict[str, object]:
    return {
        "id": identifier,
        "severity": severity,
        "category": category,
        "title": title,
        "summary": summary,
        "exploitability": exploitability,
        "impact": impact,
        "protection": protection,
        "recommendation": recommendation,
        "evidence": evidence,
        "issue_title": issue_title,
        "issue_labels": issue_labels,
        "issue_fix": issue_fix,
        "issue_acceptance": issue_acceptance,
    }


FINDINGS = [
    finding(
        "F-01",
        "Alta",
        "Permissao no navegador / privacidade AI",
        "Classificacao de dados e consentimento sao opcionais no chat e embedding",
        "O caminho IPC de baixo nivel aceita mensagens ou entradas sem dataTypes. A protecao de nuvem so exige consentimento e allowlist quando dataTypes existe e nao esta vazia.",
        "Requer privacyMode HYBRID ou CLOUD_ALLOWED, uma rota/provedor cloud habilitado e chamada direta a window.api.ai.chat ou window.api.ai.embed sem dataTypes. Nessa combinacao, a entrada segue para o provedor cloud.",
        "Notas, transcricoes ou outros dados locais podem sair para um provedor externo sem a confirmacao e a classificacao previstas pelo modelo de privacidade.",
        "O padrao e LOCAL_ONLY, provedores cloud iniciam desabilitados e os fluxos grounded/chapter/notes passam classificacao explicita. O defeito permanece no contrato IPC generico e nos testes que aceitam chat cloud sem dataTypes.",
        "Torne a classificacao um requisito derivado no Main para qualquer operacao cloud; rejeite dataTypes ausente quando a entrada vier de conteudo local, exija cloudConsent e allowlist, e remova ou restrinja o caminho generico do renderer.",
        [
            ("src/main/services/ai/ai-routing.service.ts:60-72", "A verificacao de consentimento e da allowlist roda somente quando request.dataTypes existe e possui itens."),
            ("src/main/ipc/ai.ipc.ts:162-208", "parseChatInput e parseEmbeddingRequest tratam dataTypes e cloudConsent como campos opcionais."),
            ("src/main/services/ai/ai-core.service.ts:269-272", "O Main encaminha a request para assertPrivacyAllows sem preencher a classificacao ausente."),
            ("src/main/services/ai/ai-provider.ts:217-235", "O provider envia o request HTTP e o Bearer do credential quando a rota e cloud."),
            ("src/preload/index.ts:325-338", "chat e embed sao expostos diretamente ao renderer."),
            ("test/ai-core.test.ts:247-262", "O teste considera valido o caminho cloud em HYBRID com chat sem dataTypes."),
        ],
        "[Seguranca] Exige classificacao e consentimento antes de enviar dados a provedores cloud",
        "security, severity:high",
        "Centralizar uma funcao Main-only que derive dataTypes do fluxo e recusar requests cloud sem classificacao, consentimento e allowlist compatveis. Ajustar o contrato IPC e os testes do chat/embed.",
        [
            "[ ] Chat e embedding cloud rejeitam entradas sem classificacao de dados.",
            "[ ] Consentimento e allowlist sao verificados para cada tipo de dado.",
            "[ ] Existe teste negativo para omissao de dataTypes no caminho IPC generico.",
            "[ ] Os fluxos locais continuam funcionando em LOCAL_ONLY.",
        ],
    ),
    finding(
        "F-02",
        "Alta",
        "Permissao no navegador / filesystem",
        "vault:delete aceita qualquer caminho para remocao recursiva",
        "O handler valida apenas que path e uma string nao vazia. Quando deleteFiles e true, o service remove recursivamente o caminho recebido sem confirmar que ele e um vault registrado ou selecionado pelo Main.",
        "Com o bridge disponivel para um renderer comprometido ou uma pagina carregada indevidamente na janela, basta invocar vault:delete com qualquer diretorio ou arquivo existente e deleteFiles=true.",
        "Pode apagar recursivamente dados fora do vault, incluindo diretorios do usuario. A remocao e executada com fs.promises.rm(..., recursive: true, force: true).",
        "O service fecha o banco se o caminho e o vault atual e remove a entrada do registro. A UI possui confirmacao, mas isso nao e uma autorizacao confiavel no Main.",
        "Aceite somente uma referencia de vault emitida pelo Main ou um caminho canonico presente no registro; valide raiz, tipo de objeto, vault atual e uma confirmacao/capability de uso unico antes de qualquer rm recursivo.",
        [
            ("src/preload/index.ts:7-15", "O renderer recebe vault.delete(path, deleteFiles) no bridge."),
            ("src/main/ipc/vault.ipc.ts:92-99", "O handler repassa o path recebido e Boolean(deleteFiles) sem validacao de registro ou capability."),
            ("src/main/services/vault.service.ts:216-222", "Depois de remover do registro, deleteFiles dispara fs.promises.rm(trimmedPath, { recursive: true, force: true })."),
        ],
        "[Seguranca] Restringe exclusao de vault a caminhos registrados e confirmados pelo Main",
        "security, severity:high",
        "Substituir path livre por uma capability de vault emitida pelo Main, normalizar/canonizar o alvo e recusar qualquer alvo fora de um vault registrado e validado. Manter a confirmacao de UI como camada adicional.",
        [
            "[ ] Caminho nao registrado nunca chega a fs.promises.rm.",
            "[ ] A capability expira e e de uso unico.",
            "[ ] Arquivos fora do vault e o proprio diretorio-raiz protegido sao recusados.",
            "[ ] Ha teste de regressao para path arbitrario com deleteFiles=true.",
        ],
    ),
    finding(
        "F-03",
        "Alta",
        "Permissao no navegador / mutacoes fisicas",
        "Mutacoes de arquivos confiam em IDs e caminhos controlados pelo renderer",
        "Operacoes destrutivas usam IDs sem uma identidade de caller e a reorganizacao aceita uma lista de mutacoes enviada pelo renderer. O service resolve diretamente sourcePath existente e move para destinationPath sem validar pertencimento ao curso ou ao vault.",
        "Um renderer comprometido pode chamar courses:delete-lesson com um lessonId valido e deleteFileFromDisk=true, ou courses:apply-reorganize-plan com sourcePath/destinationPath arbitrarios. O caminho da reorganizacao nem exige courseId valido em runtime.",
        "Uma aula pode apagar o arquivo fisico referenciado, inclusive em curso local-ref externo. A reorganizacao pode mover/copiar e apagar a origem de um arquivo fora do curso, criando tambem destino controlado pelo atacante.",
        "A aplicacao registra operacoes em journal e a UI mostra preview/aprovacao. O curso e consultado para gerar o plano, mas a aplicacao nao verifica que o plano recebido e o plano gerado nem limita source/destination ao rootPath.",
        "Valide no Main a relacao ID -> curso ativo e a politica de sourceType; para reorganizacao, emita e consuma um plano/capability Main-only, recanonicalize cada origem/destino dentro do root permitido e separe remocao de registro de exclusao fisica.",
        [
            ("src/main/ipc/courses.ipc.ts:812-824", "delete-lesson aceita lessonId e a flag de exclusao diretamente do renderer."),
            ("src/main/services/database.service.ts:4502-4524", "O service busca file_path por ID e executa fs.unlinkSync(lesson.filePath) antes de apagar a linha."),
            ("src/main/ipc/courses.ipc.ts:897-907", "apply-reorganize-plan aceita mutations e courseId sem validar a origem do plano."),
            ("src/main/services/reorganizer.service.ts:209-234", "resolveActualSourcePath aceita sourcePath existente e safeMoveFile usa mutation.destinationPath sem containment check."),
            ("src/types/course.ts:20-27,84-90", "O modelo suporta local-ref e caminhos fisicos absolutos, inclusive fora do vault."),
        ],
        "[Seguranca] Valida escopo e proveniencia nas mutacoes fisicas de cursos",
        "security, severity:high",
        "Aplicar autorizacao Main-only aos planos e mutacoes: validar curso ativo, sourceType, raiz canonica, origem, destino e frescor do preview. Bloquear exclusao fisica de local-ref sem fluxo explicito e seguro.",
        [
            "[ ] Mutacao fabricada pelo renderer e recusada.",
            "[ ] Origem e destino precisam estar dentro da raiz autorizada.",
            "[ ] delete-lesson nao apaga arquivos local-ref por padrao.",
            "[ ] Testes cobrem ID valido com caminho externo e plano com destino fora do curso.",
        ],
    ),
    finding(
        "F-04",
        "Media",
        "Permissao no navegador / abertura pelo SO",
        "system:open-path pode entregar atalhos e HTML ao aplicativo padrao",
        "A allowlist de extensoes e usada como unica barreira antes de shell.openPath. Ela inclui .lnk, .url, .html, .htm e .webloc; no Windows, abrir um .lnk pelo shell pode executar o alvo do atalho.",
        "Requer acesso ao bridge por renderer comprometido e a existencia de um arquivo com uma extensao aceita. Um .lnk pode apontar para um comando local; .url pode abrir uma URL e HTML pode executar conteudo no navegador padrao.",
        "O impacto varia de execucao de comando via atalho a phishing/navegacao externa. O risco nao e eliminado pelo teste de stat.isFile().",
        "system:open-external restringe URL a http/https, e a aplicacao limita extensoes. A propria funcao openPath, porem, nao exige origem nativa, caminho registrado ou capability e contradiz o comentario de que nao executa caminhos arbitrarios.",
        "Remova tipos de link do caminho generico, ou aceite apenas uma capability emitida por dialog.showOpenDialog para um alvo explicitamente escolhido. Se HTML precisar ser aberto, trate-o como conteudo nao confiavel e nao o entregue ao shell sem politica clara.",
        [
            ("src/main/ipc/settings.ipc.ts:74-82", "open-path valida string, extensao e isFile, e entao chama shell.openPath(filePath)."),
            ("src/main/utils/file-utils.ts:88-95", "LINK_EXTENSIONS inclui .url, .lnk, .html, .htm e .webloc."),
            ("src/main/utils/file-utils.ts:158-166", "isImportableFile considera LINK_EXTENSIONS como permitido."),
            ("src/preload/index.ts:396-400", "openPath e exposto ao renderer como funcao que aceita path livre."),
        ],
        "[Seguranca] Bloqueia atalhos e caminhos arbitrarios em system:open-path",
        "security, severity:medium",
        "Trocar a allowlist por capability/caminho registrado e excluir .lnk, .url, .webloc e HTML da abertura pelo shell. Manter abertura externa exclusivamente por URL validada e fluxo explicito.",
        [
            "[ ] Um path livre nunca e passado a shell.openPath.",
            "[ ] .lnk, .url, .webloc e HTML sao recusados ou tratados em fluxo isolado.",
            "[ ] Ha teste de regressao para .lnk e para path fora do inventario.",
        ],
    ),
    finding(
        "F-05",
        "Alta",
        "Permissao no navegador / registro e leitura de arquivos",
        "Endpoints legados permitem envenenar o registro de midia com caminhos do renderer",
        "O fluxo novo usa capabilities e sessoes Main-owned, mas o fluxo multi-curso ainda escaneia folderPath livre e import-batch persiste proposal.rootPath, lesson.filePath e resource.filePath sem verificar que vieram do scan autorizado.",
        "Um renderer comprometido pode fabricar uma proposta apontando para um PDF, video ou recurso privado fora do curso selecionado e chamar import-batch. O mesmo limite aparece no plano de organizacao e no conversor SRT, que aceitam caminhos crus.",
        "Os caminhos persistidos entram em getRegisteredMediaPaths. O protocolo media:// entao os trata como registrados e permite leitura/streaming do arquivo pela aplicacao, transformando uma entrada controlada pelo renderer em autorizacao persistente.",
        "O protocolo rejeita caminhos nao registrados e os testes cobrem essa negativa. A registry de capability de importacao e one-shot/TTL, mas nao protege os endpoints legados ainda expostos no preload e usados pelo ImportWizard.",
        "Remova os endpoints legados ou faça-os consumir somente sessoes/capabilities Main-owned. Revalide canonical path, existencia, extensao e pertencimento ao sourceRoot no commit; nunca copie caminhos fisicos de propostas do renderer para o banco.",
        [
            ("src/main/ipc/courses.ipc.ts:671-685", "scan-multi-course-folder aceita folderPath cru e escaneia o diretorio recebido."),
            ("src/main/ipc/courses.ipc.ts:695-719", "import-batch valida apenas items nao vazio e passa proposal diretamente a buildCourseHierarchy/saveCourseWithHierarchy."),
            ("src/main/services/course-import.service.ts:622-655,685-728", "buildCourseHierarchy copia rootPath, lesson.filePath, coverPath e resource.filePath para entidades persistidas."),
            ("src/main/services/database.service.ts:126-147", "getRegisteredMediaPaths agrega os caminhos persistidos em courses, lessons e content_resources."),
            ("src/main/protocol.ts:162-186,295-317", "O media:// authorizer permite caminho registrado exatamente e o handler faz o streaming apos a autorizacao."),
            ("src/renderer/src/components/import/ImportWizard.tsx:322-366,459-485", "O fluxo de multiplos cursos ainda chama scan cru e depois importBatch."),
            ("src/main/ipc/courses.ipc.ts:863-877", "convert-srt-to-vtt tambem le e retorna conteudo de um srtPath cru apos apenas validar extensao/existencia."),
            ("src/main/services/organization/organization-plan.service.ts:198-234", "applyPlan aceita details.newFilePath do plano recebido e grava file_path sem revalidar escopo."),
        ],
        "[Seguranca] Elimina caminhos crus dos endpoints de importacao e leitura",
        "security, severity:high",
        "Desativar import-batch/scan legado ou adaptar ambos ao registry de capability e a uma sessao Main-owned. Validar todos os caminhos no Main antes de persistir ou ler e cobrir import, plano, SRT e content resources.",
        [
            "[ ] Proposta fabricada com filePath fora do sourceRoot e recusada.",
            "[ ] Somente caminhos emitidos pelo Main entram no banco.",
            "[ ] media:// continua negando arquivo nao registrado.",
            "[ ] SRT e plano de organizacao recusam caminhos crus.",
        ],
    ),
]


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "body": ParagraphStyle("AuditBody", parent=base["BodyText"], fontName=FONT, fontSize=9.2, leading=12.5, textColor=colors.HexColor("#1F2937"), spaceAfter=6),
        "small": ParagraphStyle("AuditSmall", parent=base["BodyText"], fontName=FONT, fontSize=7.5, leading=9.6, textColor=colors.HexColor("#374151"), spaceAfter=3),
        "caption": ParagraphStyle("AuditCaption", parent=base["BodyText"], fontName=FONT, fontSize=7.2, leading=9, textColor=colors.HexColor("#4B5563"), spaceAfter=4),
        "h1": ParagraphStyle("AuditH1", parent=base["Heading1"], fontName=FONT_BOLD, fontSize=19, leading=23, textColor=colors.HexColor("#111827"), spaceBefore=7, spaceAfter=11),
        "h2": ParagraphStyle("AuditH2", parent=base["Heading2"], fontName=FONT_BOLD, fontSize=13, leading=16, textColor=colors.HexColor("#111827"), spaceBefore=10, spaceAfter=6),
        "h3": ParagraphStyle("AuditH3", parent=base["Heading3"], fontName=FONT_BOLD, fontSize=10.5, leading=13, textColor=colors.HexColor("#374151"), spaceBefore=7, spaceAfter=4),
        "cover_title": ParagraphStyle("AuditCoverTitle", parent=base["Title"], fontName=FONT_BOLD, fontSize=27, leading=32, alignment=TA_CENTER, textColor=colors.HexColor("#111827"), spaceAfter=14),
        "cover_subtitle": ParagraphStyle("AuditCoverSubtitle", parent=base["Normal"], fontName=FONT, fontSize=12, leading=16, alignment=TA_CENTER, textColor=colors.HexColor("#4B5563"), spaceAfter=7),
        "center": ParagraphStyle("AuditCenter", parent=base["Normal"], fontName=FONT, fontSize=9, leading=12, alignment=TA_CENTER, textColor=colors.HexColor("#374151")),
        "table_header": ParagraphStyle("AuditTableHeader", parent=base["Normal"], fontName=FONT_BOLD, fontSize=7.5, leading=9, textColor=colors.white),
        "table": ParagraphStyle("AuditTable", parent=base["Normal"], fontName=FONT, fontSize=7.5, leading=9.5, textColor=colors.HexColor("#1F2937")),
        "table_bold": ParagraphStyle("AuditTableBold", parent=base["Normal"], fontName=FONT_BOLD, fontSize=7.5, leading=9.5, textColor=colors.HexColor("#111827")),
        "code": ParagraphStyle("AuditCode", parent=base["Code"], fontName=FONT_MONO, fontSize=6.6, leading=8.1, textColor=colors.HexColor("#111827"), leftIndent=4, rightIndent=4),
        "issue": ParagraphStyle("AuditIssue", parent=base["Code"], fontName=FONT_MONO, fontSize=6.8, leading=8.4, textColor=colors.HexColor("#111827"), leftIndent=5, rightIndent=5),
        "callout": ParagraphStyle("AuditCallout", parent=base["BodyText"], fontName=FONT, fontSize=9, leading=12, textColor=colors.HexColor("#064E3B"), backColor=colors.HexColor("#ECFDF5"), borderColor=colors.HexColor("#A7F3D0"), borderWidth=0.6, borderPadding=8, spaceBefore=4, spaceAfter=7),
    }


def para(text: str, style: ParagraphStyle, bold_label: str | None = None) -> Paragraph:
    if bold_label:
        content = f"<b>{escape(bold_label)}</b> {escape(text)}"
    else:
        content = escape(text).replace("\n", "<br/>")
    return Paragraph(content, style)


def html_para(markup: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(markup, style)


def severity_chip(level: str, style: ParagraphStyle) -> Paragraph:
    color = SEVERITY_COLORS.get(level, "#374151")
    return Paragraph(f'<font color="{color}"><b>{escape(level.upper())}</b></font>', style)


def donut_chart(counts: dict[str, int]) -> Drawing:
    drawing = Drawing(510, 190)
    data = [(name, count) for name, count in counts.items() if count]
    pie = Pie()
    pie.x = 20
    pie.y = 18
    pie.width = 145
    pie.height = 145
    pie.data = [count for _, count in data]
    pie.labels = ["" for _ in data]
    pie.sideLabels = False
    pie.simpleLabels = False
    pie.slices.strokeWidth = 0.7
    pie.slices.strokeColor = colors.white
    for index, (name, _) in enumerate(data):
        pie.slices[index].fillColor = colors.HexColor(SEVERITY_COLORS[name])
    drawing.add(pie)
    drawing.add(Circle(92.5, 90.5, 43, fillColor=colors.white, strokeColor=colors.white))
    total = sum(count for _, count in data)
    drawing.add(String(92.5, 94, str(total), fontName=FONT_BOLD, fontSize=18, fillColor=colors.HexColor("#111827"), textAnchor="middle"))
    drawing.add(String(92.5, 77, "achados", fontName=FONT, fontSize=8, fillColor=colors.HexColor("#6B7280"), textAnchor="middle"))
    y = 143
    for name, count in data:
        drawing.add(Rect(205, y - 2, 9, 9, fillColor=colors.HexColor(SEVERITY_COLORS[name]), strokeColor=colors.white))
        drawing.add(String(222, y, f"{name}: {count}", fontName=FONT, fontSize=9, fillColor=colors.HexColor("#374151")))
        y -= 23
    return drawing


def category_chart(values: dict[str, int]) -> Drawing:
    drawing = Drawing(510, 225)
    left = 140
    bar_width = 325
    row_height = 31
    max_value = max(values.values()) or 1
    for index, (name, value) in enumerate(values.items()):
        y = 190 - index * row_height
        drawing.add(String(0, y + 4, name, fontName=FONT, fontSize=8, fillColor=colors.HexColor("#374151")))
        drawing.add(Rect(left, y, bar_width, 14, fillColor=colors.HexColor("#F3F4F6"), strokeColor=colors.HexColor("#E5E7EB")))
        if value:
            drawing.add(Rect(left, y, max(2, bar_width * value / max_value), 14, fillColor=colors.HexColor("#EA580C"), strokeColor=colors.HexColor("#EA580C")))
        drawing.add(String(left + bar_width + 9, y + 3, str(value), fontName=FONT_BOLD, fontSize=8, fillColor=colors.HexColor("#111827")))
    return drawing


def data_table(data: list[list[object]], widths: list[float], header: bool = True, repeat_rows: int = 1) -> Table:
    table = Table(data, colWidths=widths, repeatRows=repeat_rows if header else 0, hAlign="LEFT")
    commands: list[tuple[object, ...]] = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D1D5DB")),
        ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
    ]
    if header:
        commands.extend([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#374151")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ])
    table.setStyle(TableStyle(commands))
    return table


def bullet_list(items: list[str], style: ParagraphStyle) -> list[Paragraph | Spacer]:
    result: list[Paragraph | Spacer] = []
    for item in items:
        result.append(Paragraph(f"- {escape(item)}", style))
    return result


def issue_block(item: dict[str, object], index: int) -> str:
    evidence = item["evidence"]
    evidence_lines = []
    for path_line, excerpt in evidence:  # type: ignore[union-attr]
        evidence_lines.append(f"- {path_line}: {excerpt}")
    acceptance = "\n".join(str(line) for line in item["issue_acceptance"])  # type: ignore[index]
    return "\n".join(
        [
            f"--- ISSUE {index} ---",
            f"title: {item['issue_title']}",
            f"labels: {item['issue_labels']}",
            "problem: " + str(item["summary"]),
            "exploitability: " + str(item["exploitability"]),
            "evidence:",
            *evidence_lines,
            "impact: " + str(item["impact"]),
            "fix: " + str(item["issue_fix"]),
            "acceptance checklist:",
            acceptance,
            f"--- FIM ISSUE {index} ---",
        ]
    )


def wrapped_preformatted(text: str, width: int = 104) -> Preformatted:
    lines: list[str] = []
    for line in text.splitlines():
        wrapped = textwrap.wrap(line, width=width, replace_whitespace=False, drop_whitespace=False)
        lines.extend(wrapped or [""])
    return Preformatted("\n".join(lines), styles()["issue"])


def on_page(canvas, document) -> None:  # type: ignore[no-untyped-def]
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#D1D5DB"))
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, PAGE_HEIGHT - 1.35 * cm, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 1.35 * cm)
    canvas.setFont(FONT_BOLD, 7.2)
    canvas.setFillColor(colors.HexColor("#6B7280"))
    canvas.drawString(MARGIN, PAGE_HEIGHT - 1.05 * cm, "AUDITORIA DE SEGURANCA - ORBIA")
    canvas.setFont(FONT, 7.2)
    canvas.drawRightString(PAGE_WIDTH - MARGIN, 1.05 * cm, f"Pagina {document.page}")
    canvas.line(MARGIN, 1.35 * cm, PAGE_WIDTH - MARGIN, 1.35 * cm)
    canvas.restoreState()


def build_story() -> list[Flowable]:
    s = styles()
    high_count = sum(item["severity"] == "Alta" for item in FINDINGS)
    medium_count = sum(item["severity"] == "Media" for item in FINDINGS)
    story: list[Flowable] = []

    story.extend([
        Spacer(1, 2.3 * cm),
        Paragraph("Relatório de Auditoria de Segurança — Orbia", s["cover_title"]),
        Paragraph("Revisão estática de cinco superfícies de risco", s["cover_subtitle"]),
        Spacer(1, 0.2 * cm),
        Paragraph(date.today().strftime("%d/%m/%Y"), s["cover_subtitle"]),
        Spacer(1, 0.9 * cm),
    ])
    badge_data = [[
        html_para(f'<font color="#EA580C"><b>{len(FINDINGS)}</b></font><br/><font size="8">achados</font>', s["center"]),
        html_para(f'<font color="#EA580C"><b>{high_count}</b></font><br/><font size="8">alta</font>', s["center"]),
        html_para(f'<font color="#D97706"><b>{medium_count}</b></font><br/><font size="8">media</font>', s["center"]),
        html_para('<font color="#059669"><b>0</b></font><br/><font size="8">segredos confirmados</font>', s["center"]),
    ]]
    badges = Table(badge_data, colWidths=[4.1 * cm] * 4, hAlign="CENTER")
    badges.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#D1D5DB")),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#E5E7EB")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 11),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
    ]))
    story.append(badges)
    story.append(Spacer(1, 1.1 * cm))
    story.append(para("Escopo: codigo fonte, preload, renderer, handlers IPC, services, testes, configuracoes, artefatos textuais de build e historico Git alcancavel no checkout em 28/08/2026. O worktree ja possuia alteracoes do usuario; elas foram preservadas e nao foram editadas.", s["body"]))
    story.append(para("Metodologia: deteccao da stack; mapeamento Main -> IPC -> preload -> renderer; leitura de todos os 254 registros ipcMain.handle/on em 18 modulos; rastreamento de caminhos e credenciais; busca de sinks XSS; revisao das protecoes e testes existentes.", s["body"]))
    story.append(Spacer(1, 0.7 * cm))
    story.append(html_para('<b>Conclusao executiva</b><br/>Foram confirmados cinco achados condicionais, concentrados na fronteira de confianca do renderer com o processo Main. Nao foi confirmado segredo exposto nem sink XSS executavel. O protocolo media://, as capabilities de importacao e o armazenamento seguro de credenciais sao protecoes reais, mas alguns endpoints legados contornam essa arquitetura.', s["callout"]))
    story.append(PageBreak())

    story.append(Paragraph("1. Stack detectada e limites de aplicabilidade", s["h1"]))
    stack_rows = [
        [para("Dimensao", s["table_header"]), para("Evidencia no projeto", s["table_header"]), para("Impacto na auditoria", s["table_header"])],
        [para("Linguagem/runtime", s["table_bold"]), para("TypeScript; Electron 39; processo Main Node.js; preload isolado; renderer React 19 com Vite/electron-vite.", s["table"]), para("Privilegios importantes atravessam IPC, nao HTTP.", s["table"])],
        [para("Persistencia", s["table_bold"]), para("better-sqlite3 com SQL parametrizado; banco de configuracao e library.db por vault; WAL e foreign_keys ON.", s["table"]), para("Nao ha ORM/query builder. O limite de dados e o vault ativo, nao um tenant.", s["table"])],
        [para("Auth/tenant", s["table_bold"]), para("Nenhum login, sessao de usuario, organizationId, tenantId ou RLS foi encontrado. Perfis locais sao preferencias, nao identidade/autorizacao.", s["table"]), para("Banco sem tranca e IDOR classico: N/A por ausencia de fronteira multiusuario.", s["table"])],
        [para("Frontend/bridge", s["table_bold"]), para("BrowserWindow com contextIsolation=true e nodeIntegration=false; window.api expoe os handlers IPC ao renderer.", s["table"]), para("A autorizacao efetiva precisa existir no Main; controles de UI nao bastam.", s["table"])],
        [para("Deploy", s["table_bold"]), para("electron-builder.yml. Nao foram encontrados Dockerfile, CI, Helm, charts ou Terraform.", s["table"]), para("Nao ha superficie de segredo nesses mecanismos no checkout auditado.", s["table"])],
        [para("AI", s["table_bold"]), para("Providers local/cloud via fetch, credenciais em safeStorage, roteamento por privacyMode e allowlist.", s["table"]), para("O contrato opcional de dataTypes e relevante para F-01.", s["table"])],
    ]
    story.append(data_table(stack_rows, [3.0 * cm, 8.0 * cm, 6.0 * cm]))
    story.append(Spacer(1, 0.35 * cm))
    story.append(Paragraph("Status por categoria solicitada", s["h2"]))
    category_rows = [[para("Categoria", s["table_header"]), para("Status", s["table_header"]), para("Resultado verificado", s["table_header"])]]
    category_rows.extend([
        [para("1. Banco sem tranca", s["table_bold"]), severity_chip("Forca", s["table"]), para("N/A como isolamento de tenant: nao existe auth/tenant/RLS. O banco ativo e por vault. SQL parametrizado, FK e WAL estao presentes.", s["table"])],
        [para("2. Permissao definida no navegador", s["table_bold"]), severity_chip("Alta", s["table"]), para("Aplicavel. Os cinco achados exploram argumentos, caminhos ou classificacoes que chegam do renderer ao Main.", s["table"])],
        [para("3. IDOR", s["table_bold"]), severity_chip("Forca", s["table"]), para("N/A como IDOR entre usuarios: nao ha identidade/ownership. Ha mutacoes por IDs no vault ativo; isso e tratado em F-03 como falha de trust boundary IPC.", s["table"])],
        [para("4. Chaves expostas", s["table_bold"]), severity_chip("Forca", s["table"]), para("Nenhuma exposicao confirmada em source/config, .env, deploy, historico ou artefatos textuais. Fixtures e simbolos de apiKey foram distinguidos de credenciais reais.", s["table"])],
        [para("5. Inputs sem tratamento / XSS", s["table_bold"]), severity_chip("Forca", s["table"]), para("Nenhum sink perigoso confirmado. Nao ha dangerouslySetInnerHTML/innerHTML/eval/DOMParser; texto usa escaping React e links externos passam por HTTP/HTTPS.", s["table"])],
    ])
    story.append(data_table(category_rows, [4.1 * cm, 2.2 * cm, 10.7 * cm]))
    story.append(PageBreak())

    story.append(Paragraph("2. Resumo executivo", s["h1"]))
    story.append(para("Os achados exigem um renderer comprometido, uma pagina nao confiavel navegando na janela ou uso de uma API exposta fora do fluxo normal. Isso e uma condicao de explorabilidade, nao uma afirmacao de que a UI normal dispara cada caminho sem acao do usuario.", s["body"]))
    story.append(Paragraph("Distribuicao por severidade", s["h2"]))
    story.append(donut_chart({"Critica": 0, "Alta": high_count, "Media": medium_count, "Baixa": 0}))
    story.append(Paragraph("Distribuicao por categoria", s["h2"]))
    story.append(category_chart({"Banco sem tranca": 0, "Permissao / IPC": len(FINDINGS), "IDOR": 0, "Chaves": 0, "XSS": 0}))
    story.append(Paragraph("Leituras prioritarias", s["h2"]))
    story.extend(bullet_list([
        "P1: fechar a fronteira Main/renderer para operacoes de filesystem e paths (F-02, F-03, F-04, F-05).",
        "P1: tornar classificacao e consentimento obrigatorios para qualquer envio cloud (F-01).",
        "P2: remover ou migrar endpoints legados para capabilities e sessoes Main-owned.",
        "P2: adicionar testes negativos de caminhos arbitrarios e chamadas IPC fora do fluxo da UI.",
    ], s["body"]))
    story.append(PageBreak())

    story.append(Paragraph("3. Pontos fortes e fragilidades", s["h1"]))
    story.append(Paragraph("Protecoes confirmadas", s["h2"]))
    story.extend(bullet_list([
        "Electron usa contextIsolation=true e nodeIntegration=false; o preload expoe uma API tipada em vez de Node ao renderer.",
        "media:// valida protocolo, caminho absoluto, extensao, registro exato e arquivo regular; arquivo nao registrado retorna 403 antes do streaming.",
        "ImportSourceCapabilityRegistry usa token opaco, TTL de cinco minutos, tipo esperado e consumo one-shot; o fluxo novo de importacao exige sessao Main-owned.",
        "SQLite usa SQL parametrizado, WAL, foreign_keys ON e conexao do vault ativo como escopo operacional.",
        "Credenciais AI sao criptografadas por safeStorage e basic_text/unknown sao recusados; snapshots nao carregam o valor do segredo.",
        "React renderiza texto de documentos e linhas de codigo com escaping; nao foram encontrados sinks de HTML bruto ou avaliacao dinamica.",
        "Backup revalida entradas do arquivo e possui verificacoes contra path traversal; essa area nao produziu achado confirmado.",
    ], s["body"]))
    story.append(Paragraph("Fragilidades confirmadas", s["h2"]))
    story.extend(bullet_list([
        "O Main nao valida sender/origem nos handlers IPC; nao ha will-navigate guard e o bridge e amplo. Isso e a condicao comum dos achados, embora os cinco achados abaixo sejam os itens contabilizados.",
        "A arquitetura segura de importacao coexiste com endpoints legados que aceitam paths/propostas do renderer.",
        "Planos e flags de mutacao sao tratados como aprovados por terem vindo da UI, sem revalidacao de escopo no Main.",
        "O contrato generico de AI permite omitir a classificacao que a politica de privacidade usa como gatilho.",
        "A categoria de link importavel conflita com a semantica segura de abrir um caminho pelo aplicativo padrao do sistema.",
    ], s["body"]))
    story.append(PageBreak())

    story.append(Paragraph("4. Achados detalhados", s["h1"]))
    summary_rows = [[para("Severidade", s["table_header"]), para("Arquivo:linha", s["table_header"]), para("Descricao", s["table_header"])]]
    for item in FINDINGS:
        evidence = item["evidence"]  # type: ignore[index]
        locations = "\n".join(path_line for path_line, _ in evidence)  # type: ignore[union-attr]
        summary_rows.append([
            severity_chip(str(item["severity"]), s["table"]),
            para(locations, s["table"]),
            para(str(item["summary"]), s["table"]),
        ])
    story.append(data_table(summary_rows, [2.0 * cm, 6.1 * cm, 8.9 * cm]))
    story.append(Spacer(1, 0.4 * cm))

    for item in FINDINGS:
        story.append(Paragraph(f"{item['id']} - {item['title']}", s["h2"]))
        story.append(html_para(f'<b>Severidade:</b> <font color="{SEVERITY_COLORS[str(item["severity"])]}"><b>{escape(str(item["severity"]).upper())}</b></font> &nbsp;&nbsp; <b>Categoria:</b> {escape(str(item["category"]))}', s["body"]))
        story.append(para(str(item["summary"]), s["body"]))
        story.append(Paragraph("Evidencia verificada", s["h3"]))
        evidence_rows = [[para("Arquivo:linha", s["table_header"]), para("Trecho/interpretacao", s["table_header"])]]
        for path_line, excerpt in item["evidence"]:  # type: ignore[index]
            evidence_rows.append([para(path_line, s["table_bold"]), para(excerpt, s["table"])])
        story.append(data_table(evidence_rows, [6.0 * cm, 11.0 * cm]))
        story.append(Spacer(1, 0.15 * cm))
        story.append(para(str(item["exploitability"]), s["body"], "Explorabilidade:"))
        story.append(para(str(item["impact"]), s["body"], "Impacto:"))
        story.append(para(str(item["protection"]), s["body"], "Protecoes existentes:"))
        story.append(para(str(item["recommendation"]), s["body"], "Recomendacao:"))
        story.append(HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#D1D5DB"), spaceBefore=3, spaceAfter=8))

    story.append(PageBreak())
    story.append(Paragraph("5. Plano de correcoes priorizado", s["h1"]))
    priority_rows = [[para("Prioridade", s["table_header"]), para("Acao", s["table_header"]), para("Achados", s["table_header"])],
        [para("P1", s["table_bold"]), para("Fechar mutacoes/leituras de filesystem: capabilities Main-only, containment canonico e bloqueio de shell para links.", s["table"]), para("F-02, F-03, F-04, F-05", s["table"])],
        [para("P1", s["table_bold"]), para("Tornar classificacao, consentimento e allowlist obrigatorios para chat/embed cloud.", s["table"]), para("F-01", s["table"])],
        [para("P2", s["table_bold"]), para("Remover caminhos crus legados e exigir sessao/capability em importacao, plano de organizacao e conversao SRT.", s["table"]), para("F-05", s["table"])],
        [para("P2", s["table_bold"]), para("Adicionar validacao centralizada de sender/origem e uma politica de navegacao da BrowserWindow.", s["table"]), para("Condicao comum", s["table"])],
        [para("P3", s["table_bold"]), para("Manter testes de regressao para media nao registrado, safeStorage, capability one-shot e escaping React; adicionar os casos negativos listados nos issues.", s["table"]), para("Todos", s["table"])],
    ]
    story.append(data_table(priority_rows, [2.0 * cm, 11.5 * cm, 3.5 * cm]))
    story.append(Spacer(1, 0.45 * cm))
    story.append(Paragraph("Sequencia sugerida", s["h2"]))
    story.extend(bullet_list([
        "1. Introduzir uma camada Main-only de autorizacao/capabilities para caminhos e planos; migrar os endpoints que hoje recebem paths crus.",
        "2. Corrigir a politica AI e seus contratos/testes antes de habilitar uso cloud em fluxos novos.",
        "3. Aplicar allowlist segura para abertura pelo SO e revisar navegacao da BrowserWindow.",
        "4. Rodar a suite completa, typecheck e build; revisar novamente o bundle e o historico em CI.",
    ], s["body"]))
    story.append(PageBreak())

    story.append(Paragraph("6. ISSUES PARA O GITHUB", s["h1"]))
    story.append(para("Os blocos abaixo estao prontos para abertura como issues. Cada bloco agrupa apenas evidencias da mesma causa ou correcao e preserva as condicoes de explorabilidade.", s["body"]))
    for index, item in enumerate(FINDINGS, start=1):
        story.append(wrapped_preformatted(issue_block(item, index)))
        story.append(Spacer(1, 0.3 * cm))

    return story


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frame = Frame(MARGIN, MARGIN, PAGE_WIDTH - 2 * MARGIN, PAGE_HEIGHT - 2 * MARGIN, id="normal", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    document = BaseDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
        title="Relatório de Auditoria de Segurança — Orbia",
        author="Codex",
        subject="Auditoria estatica de seguranca",
    )
    document.addPageTemplates([PageTemplate(id="audit", frames=[frame], onPage=on_page)])
    document.build(build_story())
    print(f"Generated: {OUTPUT}")


if __name__ == "__main__":
    main()
