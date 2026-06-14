"""Gera o PDF Guia Rápido do Sistema Acup."""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, Image
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import PageBreak
import os, sys

OUTPUT = os.path.join(os.path.dirname(__file__), "guia-rapido-sistema-acup.pdf")

# ── Paleta ──────────────────────────────────────────────────────────────
TEAL       = colors.HexColor("#0d9488")
TEAL_LIGHT = colors.HexColor("#ccfbf1")
TEAL_DARK  = colors.HexColor("#134e4a")
GRAY_BG    = colors.HexColor("#f8fafc")
GRAY_LINE  = colors.HexColor("#e2e8f0")
GRAY_TEXT  = colors.HexColor("#475569")
WHITE      = colors.white
ORANGE     = colors.HexColor("#f97316")
AMBER      = colors.HexColor("#d97706")

# ── Estilos ─────────────────────────────────────────────────────────────
ss = getSampleStyleSheet()

def S(name, **kw):
    base = ss[name]
    return ParagraphStyle(name + "_custom_" + str(hash(str(kw))), parent=base, **kw)

title_style = S("Title",
    fontSize=26, textColor=TEAL_DARK, leading=32,
    fontName="Helvetica-Bold", alignment=TA_CENTER)

subtitle_style = S("Normal",
    fontSize=13, textColor=GRAY_TEXT, leading=18,
    fontName="Helvetica", alignment=TA_CENTER)

section_style = S("Heading1",
    fontSize=15, textColor=WHITE, leading=20,
    fontName="Helvetica-Bold", alignment=TA_LEFT,
    spaceBefore=6, spaceAfter=4)

step_title_style = S("Heading2",
    fontSize=12, textColor=TEAL_DARK, leading=16,
    fontName="Helvetica-Bold", spaceBefore=8, spaceAfter=2)

body_style = S("Normal",
    fontSize=10, textColor=colors.HexColor("#1e293b"),
    leading=15, fontName="Helvetica",
    alignment=TA_JUSTIFY)

small_style = S("Normal",
    fontSize=9, textColor=GRAY_TEXT,
    leading=13, fontName="Helvetica")

bullet_style = S("Normal",
    fontSize=10, textColor=colors.HexColor("#1e293b"),
    leading=15, fontName="Helvetica",
    leftIndent=14, firstLineIndent=-10)

note_style = S("Normal",
    fontSize=9.5, textColor=TEAL_DARK,
    leading=14, fontName="Helvetica-Oblique")

badge_style = S("Normal",
    fontSize=9, textColor=WHITE,
    fontName="Helvetica-Bold", alignment=TA_CENTER)

# ── Helpers ─────────────────────────────────────────────────────────────

def section_header(text):
    """Barra colorida de seção."""
    t = Table([[Paragraph(text, section_style)]], colWidths=[17*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), TEAL),
        ("ROUNDEDCORNERS", [6]),
        ("TOPPADDING",    (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("LEFTPADDING",   (0,0), (-1,-1), 14),
    ]))
    return t

def step_card(number, title, color, content_paragraphs):
    """Card de passo com número circulado."""
    badge = Table([[Paragraph(str(number), badge_style)]],
                  colWidths=[1*cm], rowHeights=[1*cm])
    badge.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), color),
        ("ROUNDEDCORNERS",[20]),
        ("ALIGN",         (0,0), (-1,-1), "CENTER"),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 0),
    ]))

    header_cell = [badge, Paragraph(title, step_title_style)]
    inner = Table([header_cell], colWidths=[1.2*cm, 15.8*cm])
    inner.setStyle(TableStyle([
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING",   (0,0), (-1,-1), 0),
        ("RIGHTPADDING",  (0,0), (-1,-1), 0),
        ("TOPPADDING",    (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))

    block = [inner] + content_paragraphs
    wrapper = Table([[b] for b in block], colWidths=[17*cm])
    wrapper.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), GRAY_BG),
        ("BOX",           (0,0), (-1,-1), 1, GRAY_LINE),
        ("ROUNDEDCORNERS",[8]),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("RIGHTPADDING",  (0,0), (-1,-1), 12),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
    ]))
    return wrapper

def img_placeholder(label, w=17*cm, h=5.5*cm):
    """Caixa tracejada para screenshots."""
    t = Table([[Paragraph(
        f'<font color="#94a3b8">[ Imagem: {label} ]</font>',
        S("Normal", fontSize=10, alignment=TA_CENTER, textColor=colors.HexColor("#94a3b8"))
    )]], colWidths=[w], rowHeights=[h])
    t.setStyle(TableStyle([
        ("BOX",           (0,0), (-1,-1), 1.5, GRAY_LINE),
        ("LINEDASH",      (0,0), (-1,-1), 4, 4),
        ("BACKGROUND",    (0,0), (-1,-1), colors.HexColor("#f1f5f9")),
        ("ALIGN",         (0,0), (-1,-1), "CENTER"),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("ROUNDEDCORNERS",[6]),
    ]))
    return t

def two_col_table(rows):
    t = Table(rows, colWidths=[4*cm, 13*cm])
    t.setStyle(TableStyle([
        ("FONTNAME",      (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 9.5),
        ("TEXTCOLOR",     (0,0), (0,-1), TEAL_DARK),
        ("TEXTCOLOR",     (1,0), (1,-1), colors.HexColor("#1e293b")),
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LINEBELOW",     (0,0), (-1,-2), 0.5, GRAY_LINE),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
    ]))
    return t

def flow_arrow():
    t = Table([[Paragraph(
        '<font color="#0d9488" size="16">&#9660;</font>',
        S("Normal", alignment=TA_CENTER, fontSize=16)
    )]], colWidths=[17*cm], rowHeights=[0.7*cm])
    t.setStyle(TableStyle([
        ("ALIGN",  (0,0), (-1,-1), "CENTER"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 0),
    ]))
    return t

# ── Conteúdo ─────────────────────────────────────────────────────────────

def build_story():
    story = []
    sp = lambda n=1: Spacer(1, n * 0.35*cm)

    # ── CAPA ──────────────────────────────────────────────────────────────
    story += [
        Spacer(1, 2.5*cm),
        Paragraph("Sistema Acup", title_style),
        sp(0.5),
        Paragraph("Guia Rápido de Consulta", subtitle_style),
        sp(0.3),
        Paragraph("Fluxo clínico passo a passo", S("Normal",
            fontSize=11, textColor=GRAY_TEXT, alignment=TA_CENTER)),
        sp(2),
        HRFlowable(width="60%", thickness=2, color=TEAL, spaceAfter=6),
        sp(0.5),
        Paragraph(
            "Este guia apresenta de forma objetiva como realizar uma consulta completa "
            "de acupuntura utilizando o sistema — desde o login até a geração do relatório.",
            S("Normal", fontSize=10.5, textColor=GRAY_TEXT, alignment=TA_CENTER, leading=16)),
        sp(3),
    ]

    # Quadro de navegação rápida
    nav_data = [
        [Paragraph("<b>Módulo</b>", small_style), Paragraph("<b>Abas disponíveis</b>", small_style)],
        [Paragraph("Avaliação", S("Normal", fontSize=9.5, textColor=TEAL_DARK, fontName="Helvetica-Bold")),
         Paragraph("Anamnese · Língua · Pulso", small_style)],
        [Paragraph("Diagnóstico", S("Normal", fontSize=9.5, textColor=TEAL_DARK, fontName="Helvetica-Bold")),
         Paragraph("Raciocínio Clínico · Diagnóstico", small_style)],
        [Paragraph("Tratamento", S("Normal", fontSize=9.5, textColor=TEAL_DARK, fontName="Helvetica-Bold")),
         Paragraph("Protocolo · Evolução", small_style)],
        [Paragraph("Apoio", S("Normal", fontSize=9.5, textColor=TEAL_DARK, fontName="Helvetica-Bold")),
         Paragraph("Biblioteca · Relatório", small_style)],
    ]
    nav_t = Table(nav_data, colWidths=[5*cm, 12*cm])
    nav_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), TEAL),
        ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 9.5),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [TEAL_LIGHT, WHITE]),
        ("GRID",          (0,0), (-1,-1), 0.5, GRAY_LINE),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("ROUNDEDCORNERS",[4]),
    ]))
    story.append(nav_t)
    story.append(sp(1.5))
    story.append(Paragraph(
        "Versão 1.0 · Junho 2026 · neuroreabilitys@gmail.com",
        S("Normal", fontSize=8.5, textColor=GRAY_TEXT, alignment=TA_CENTER)))
    story.append(PageBreak())

    # ── VISÃO GERAL DO FLUXO ───────────────────────────────────────────────
    story += [section_header("  Visão Geral do Fluxo de Consulta"), sp()]

    # Diagrama de fluxo em tabela
    flow_steps = [
        ("1", "Login", TEAL),
        ("2", "Selecionar / Cadastrar Paciente", TEAL),
        ("3", "Anamnese — queixas e histórico", colors.HexColor("#0284c7")),
        ("4", "Avaliação da Língua", colors.HexColor("#0284c7")),
        ("5", "Avaliação do Pulso", colors.HexColor("#0284c7")),
        ("6", "Raciocínio Clínico + Diagnóstico", AMBER),
        ("7", "Definir Protocolo de Pontos", ORANGE),
        ("8", "Registrar Evolução", colors.HexColor("#16a34a")),
        ("9", "Gerar Relatório", colors.HexColor("#7c3aed")),
    ]
    flow_rows = []
    for num, label, col in flow_steps:
        cell = Table(
            [[Paragraph(f"<b>{num}</b>", S("Normal", fontSize=9, textColor=WHITE, alignment=TA_CENTER)),
              Paragraph(label, S("Normal", fontSize=10, textColor=WHITE, fontName="Helvetica-Bold"))]],
            colWidths=[1*cm, 14*cm])
        cell.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), col),
            ("ROUNDEDCORNERS",[6]),
            ("ALIGN",         (0,0), (0,-1), "CENTER"),
            ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
            ("TOPPADDING",    (0,0), (-1,-1), 7),
            ("BOTTOMPADDING", (0,0), (-1,-1), 7),
            ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ]))
        flow_rows.append(cell)

    # intercala setas
    interleaved = []
    for i, row in enumerate(flow_rows):
        interleaved.append(row)
        if i < len(flow_rows) - 1:
            interleaved.append(flow_arrow())

    for el in interleaved:
        story.append(el)
    story.append(sp(2))
    story.append(PageBreak())

    # ── PASSO A PASSO ──────────────────────────────────────────────────────

    # 1. Login
    story += [section_header("  Passo 1 · Login"), sp()]
    story.append(step_card(1, "Acessando o sistema", TEAL, [
        Paragraph(
            "Ao abrir o sistema, a tela de <b>Login</b> é exibida. "
            "Informe seu e-mail e senha cadastrados pelo administrador.",
            body_style),
        sp(0.4),
        two_col_table([
            ["E-mail:", "Fornecido pelo responsável da clínica."],
            ["Senha:", "Temporária no primeiro acesso — o sistema solicitará troca imediata."],
            ["Perfis:", "Acupunturista · Super Admin (acesso total ao painel de gestão)."],
        ]),
        sp(0.5),
        img_placeholder("Tela de Login"),
    ]))
    story.append(sp())

    # 2. Paciente
    story += [section_header("  Passo 2 · Paciente"), sp()]
    story.append(step_card(2, "Selecionar ou cadastrar paciente", colors.HexColor("#0284c7"), [
        Paragraph(
            "Após o login, a <b>Tela Inicial</b> exibe um campo de busca e a lista de pacientes. "
            "Selecione um existente ou clique em <b>+ Novo Paciente</b> para cadastrar.",
            body_style),
        sp(0.4),
        two_col_table([
            ["Dados básicos:", "Nome, data de nascimento, telefone, e-mail."],
            ["Histórico:", "Sessões anteriores ficam vinculadas automaticamente ao paciente."],
            ["Arquivamento:", "Pacientes inativos podem ser arquivados para manter a lista limpa."],
        ]),
        sp(0.5),
        img_placeholder("Tela Inicial — lista de pacientes"),
    ]))
    story.append(sp())

    # 3. Anamnese
    story += [section_header("  Passo 3 · Anamnese"), sp()]
    story.append(step_card(3, "Coleta de queixas e histórico clínico", colors.HexColor("#0284c7"), [
        Paragraph(
            "A aba <b>Anamnese</b> apresenta checklists organizados por sistemas "
            "(digestivo, respiratório, emocional etc.). Marque os sintomas relatados pelo paciente.",
            body_style),
        sp(0.4),
        two_col_table([
            ["Checklists:", "Grupos pré-definidos com os sintomas mais relevantes da MTC."],
            ["Queixa principal:", "Campo livre para descrever o motivo da consulta."],
            ["Salvo automático:", "O estado é salvo a cada alteração — sem risco de perda."],
        ]),
        sp(0.5),
        img_placeholder("Aba Anamnese — checklists de sintomas"),
    ]))
    story.append(sp())
    story.append(PageBreak())

    # 4. Língua
    story += [section_header("  Passo 4 · Avaliação da Língua"), sp()]
    story.append(step_card(4, "Inspeção e análise da língua", colors.HexColor("#0284c7"), [
        Paragraph(
            "Na aba <b>Língua</b>, clique nas regiões do mapa lingual para registrar "
            "alterações. O sistema cruza as seleções com padrões da MTC e exibe pistas diagnósticas.",
            body_style),
        sp(0.4),
        two_col_table([
            ["Mapa interativo:", "Regiões clicáveis: ponta, bordas, centro, raiz."],
            ["Características:", "Cor, forma, saburra, umidade — checkboxes dedicados."],
            ["IA opcional:", "Upload de foto da língua para análise assistida (fase 5)."],
        ]),
        sp(0.5),
        img_placeholder("Aba Língua — mapa interativo"),
    ]))
    story.append(sp())

    # 5. Pulso
    story += [section_header("  Passo 5 · Avaliação do Pulso"), sp()]
    story.append(step_card(5, "Palpação e classificação do pulso", colors.HexColor("#0284c7"), [
        Paragraph(
            "Na aba <b>Pulso</b>, selecione as qualidades do pulso para cada posição "
            "(Cun, Guan, Chi — bilateral). O sistema tabula automaticamente.",
            body_style),
        sp(0.4),
        two_col_table([
            ["Posições:", "Cun (proximal) · Guan (médio) · Chi (distal) — mãos E e D."],
            ["Qualidades:", "Superficial, profundo, lento, rápido, tenso, escorregadio, etc."],
            ["Interpretação:", "Cruzamento automático com os padrões registrados na Anamnese."],
        ]),
        sp(0.5),
        img_placeholder("Aba Pulso — seleção de qualidades"),
    ]))
    story.append(sp())
    story.append(PageBreak())

    # 6. Raciocínio + Diagnóstico
    story += [section_header("  Passos 6–7 · Raciocínio Clínico e Diagnóstico"), sp()]
    story.append(step_card(6, "Raciocínio Clínico — IA assistente", AMBER, [
        Paragraph(
            "A aba <b>Raciocínio Clínico</b> consolida todos os dados coletados e apresenta "
            "uma síntese assistida: padrões graduados por confiança, diagnóstico diferencial "
            "e os pontos mais relevantes.",
            body_style),
        sp(0.4),
        two_col_table([
            ["Síntese IA:", "Padrões de desarmonia ordenados por peso clínico."],
            ["Diferencial:", "Destaque para padrões que precisam de confirmação."],
            ["Confiança:", "Barra percentual baseada na completude dos dados inseridos."],
        ]),
        sp(0.5),
        img_placeholder("Aba Raciocínio Clínico — síntese e padrões"),
    ]))
    story.append(sp(0.6))
    story.append(step_card(7, "Diagnóstico — confirmação final", AMBER, [
        Paragraph(
            "Na aba <b>Diagnóstico</b>, confirme ou ajuste o padrão principal e os "
            "secundários. Esta etapa serve como registro formal do diagnóstico da sessão.",
            body_style),
        sp(0.4),
        img_placeholder("Aba Diagnóstico — confirmação do padrão"),
    ]))
    story.append(sp())
    story.append(PageBreak())

    # 7. Protocolo
    story += [section_header("  Passo 8 · Protocolo de Pontos"), sp()]
    story.append(step_card(8, "Seleção dos pontos acupunturais", ORANGE, [
        Paragraph(
            "A aba <b>Protocolo</b> apresenta os mapas corporais interativos "
            "(frente, dorso, mãos e pés). Clique nos pontos para adicioná-los ao protocolo. "
            "O sistema sugere pontos baseados no diagnóstico.",
            body_style),
        sp(0.4),
        two_col_table([
            ["Mapas:", "Corpo frontal · dorsal · mãos · pés (palmar/dorsal)."],
            ["Sugestão IA:", "Pontos recomendados aparecem destacados conforme o diagnóstico."],
            ["Detalhes:", "Clique em um ponto para ver localização, ação e indicações."],
            ["Biblioteca:", "Acesse a ficha completa de qualquer ponto direto do protocolo."],
        ]),
        sp(0.5),
        img_placeholder("Aba Protocolo — mapas corporais interativos"),
    ]))
    story.append(sp())
    story.append(PageBreak())

    # 8. Evolução
    story += [section_header("  Passo 9 · Evolução"), sp()]
    story.append(step_card(9, "Registro da sessão realizada", colors.HexColor("#16a34a"), [
        Paragraph(
            "Após a sessão, registre na aba <b>Evolução</b> os pontos efetivamente utilizados, "
            "observações clínicas e resposta do paciente.",
            body_style),
        sp(0.4),
        two_col_table([
            ["Pontos usados:", "Confirmação ou ajuste dos pontos do protocolo."],
            ["Observações:", "Campo livre para evolução narrativa."],
            ["Histórico:", "Cada evolução é associada à sessão e fica no prontuário do paciente."],
            ["Calibração:", "Dados usados vs. sugeridos alimentam o motor de recomendação."],
        ]),
        sp(0.5),
        img_placeholder("Aba Evolução — registro pós-sessão"),
    ]))
    story.append(sp())

    # 9. Relatório
    story += [section_header("  Passo 10 · Relatório"), sp()]
    story.append(step_card(10, "Geração do relatório clínico", colors.HexColor("#7c3aed"), [
        Paragraph(
            "A aba <b>Relatório</b> gera um PDF com o prontuário completo da sessão: "
            "dados do paciente, diagnóstico, protocolo e evolução. Pode ser personalizado "
            "com o papel timbrado da clínica.",
            body_style),
        sp(0.4),
        two_col_table([
            ["Papel timbrado:", "Logo e dados da clínica aparecem no cabeçalho do PDF."],
            ["Número de sessão:", "Calculado automaticamente com base no histórico."],
            ["Edição manual:", "Campos editáveis antes de gerar o PDF final."],
            ["Download:", "Botão de exportação direta para PDF."],
        ]),
        sp(0.5),
        img_placeholder("Aba Relatório — prévia e exportação"),
    ]))
    story.append(sp(2))
    story.append(PageBreak())

    # ── BIBLIOTACA E DICAS ─────────────────────────────────────────────────
    story += [section_header("  Biblioteca Viva"), sp()]
    story.append(Paragraph(
        "A <b>Biblioteca</b> é a base de conhecimento do sistema, acessível em qualquer momento "
        "pela aba de mesmo nome. Contém fichas detalhadas de mais de 400 pontos acupunturais.",
        body_style))
    story.append(sp(0.5))

    lib_data = [
        [Paragraph("<b>Recurso</b>", S("Normal", fontSize=9.5, fontName="Helvetica-Bold")),
         Paragraph("<b>O que você encontra</b>", S("Normal", fontSize=9.5, fontName="Helvetica-Bold"))],
        ["Ficha do ponto",      "Localização, ação principal, indicações clínicas e fontes."],
        ["Busca por sintoma",   "Encontre pontos relevantes para uma queixa específica."],
        ["Busca por meridiano", "Liste todos os pontos de um meridiano."],
        ["KM-Agent",            "Curadoria contínua — equipe editorial revisa e adiciona pontos."],
    ]
    lib_t = Table(lib_data, colWidths=[5*cm, 12*cm])
    lib_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), TEAL),
        ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 9.5),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [TEAL_LIGHT, WHITE]),
        ("GRID",          (0,0), (-1,-1), 0.5, GRAY_LINE),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("ROUNDEDCORNERS",[4]),
    ]))
    story.append(lib_t)
    story.append(sp(1.5))

    story += [section_header("  Dicas Rápidas"), sp()]
    dicas = [
        ("Salvo automático",  "O sistema salva a cada interação — não há botão de salvar obrigatório. O indicador no topo mostra o status."),
        ("Múltiplas sessões", "Cada vez que você abre um paciente já existente, uma nova sessão é iniciada automaticamente."),
        ("Atalho diagnóstico","Se quiser pular direto para o Protocolo, o sistema ainda funcionará — apenas a IA terá menos dados para sugerir."),
        ("Perfil clínico",    "Usuários 'Acupunturista' veem os 150 pontos mais comuns. Super Admin tem visão irrestrita de todos os pontos."),
        ("Dark mode",         "O sistema suporta tema escuro — alternável nas configurações de perfil."),
    ]
    for titulo, texto in dicas:
        story.append(Paragraph(
            f"<b>• {titulo}:</b>  {texto}",
            S("Normal", fontSize=10, leading=15, leftIndent=8,
              textColor=colors.HexColor("#1e293b"))))
        story.append(sp(0.3))

    story.append(sp(2))
    story.append(HRFlowable(width="100%", thickness=1, color=GRAY_LINE))
    story.append(sp(0.5))
    story.append(Paragraph(
        "Sistema Acup · Guia Rápido v1.0 · Junho 2026 · neuroreabilitys@gmail.com",
        S("Normal", fontSize=8.5, textColor=GRAY_TEXT, alignment=TA_CENTER)))

    return story


# ── Montagem ─────────────────────────────────────────────────────────────

def on_page(canvas, doc):
    """Rodapé com número de página."""
    canvas.saveState()
    canvas.setFillColor(GRAY_TEXT)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(A4[0] - 2*cm, 1.2*cm,
                           f"pág. {doc.page}")
    canvas.drawString(2*cm, 1.2*cm, "Sistema Acup — Guia Rápido")
    canvas.restoreState()


doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    rightMargin=2*cm, leftMargin=2*cm,
    topMargin=2*cm, bottomMargin=2.2*cm,
    title="Sistema Acup — Guia Rápido",
    author="Sistema Acup",
    subject="Guia de uso clínico",
)

doc.build(build_story(), onFirstPage=on_page, onLaterPages=on_page)
print(f"PDF gerado: {OUTPUT}")
