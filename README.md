# PulseTube AI

Plataforma web *local-first* e landing page autoral para **síntese multimodal de vídeos e videoaulas do YouTube**, combinando apostila teórica sem lacunas, glossário técnico, capítulos com *timestamps* clicáveis sincronizados ao player, **mapa mental vetorial interativo** (*Active Recall* + expansão com IA) e **tutor Q&A econômico em tokens** — conectada diretamente à **Google Gemini API**.

---

## Sumário

1. [Visão Geral do Produto](#1-visão-geral-do-produto)
2. [Função Completa por Estrutura da Interface (`index.html`)](#2-função-completa-por-estrutura-da-interface-indexhtml)
3. [Arquitetura de Pastas e Função de Cada Arquivo](#3-arquitetura-de-pastas-e-função-de-cada-arquivo)
4. [Engenharia Multimodal, Segurança BYOK & SEO Técnico](#4-engenharia-multimodal-segurança-byok--seo-técnico)
5. [Como Executar, Configurar e Publicar (Deploy)](#5-como-executar-configurar-e-publicar-deploy)

---

## 1. Visão Geral do Produto

O **PulseTube AI** transforma qualquer vídeo público do YouTube (aulas extensas, palestras técnicas, *keynotes*, documentários, *lives* ou *Shorts*) — ou transcrições coladas manualmente para vídeos privados/não listados — em uma bancada completa de estudo ativo direto no navegador:

- **Leitura Multimodal Real (Áudio + Quadros Visuais):** o modelo analisa simultaneamente a fala e o que aparece na tela (slides, lousa, diagramas, fórmulas e blocos de código), sem depender apenas de legendas automáticas.
- **Sincronização Direta com o Player:** todos os *timecodes* (`MM:SS` / `HH:MM:SS`) do resumo, do mapa mental e do chat Q&A comandam o player do YouTube via `postMessage` (`seekTo`), saltando para o segundo exato sem recarregar a página.
- **Arquitetura 100% *Local-First* & BYOK (*Bring Your Own Key*):** não há backend intermediário nem chaves expostas no código-fonte. Cada usuário conecta sua própria chave gratuita do Google AI Studio, persistida exclusivamente no `localStorage` do próprio navegador (com remoção em 1 clique para computadores compartilhados).

---

## 2. Função Completa por Estrutura da Interface (`index.html`)

O documento principal une uma **Landing Page editorial orientada a produto** (*product-led*) e o **ambiente interativo de estudo** em um fluxo único e semântico:

### 2.1. Cabeçalho Global & Cofre da API (`<header class="site-header">`)
- **Identidade & Scrubber de Leitura (`.scroll-scrubber`):** exibe o emblema vetorial da marca (`#pt-mark` — capelo acadêmico + *Play* + pulso ECG) e uma barra superior de progresso guiada por `animation-timeline: scroll(root)` (com *fallback* em JS).
- **Navegação Responsiva (`#site-nav`):** âncoras diretas para as seções informativas em desktop e menu nativo via **Popover API** (`popover` / `popovertarget`) em telas móveis.
- **Controles de Sessão (`.site-header__actions`):**
  - **Status da API & Latência Viva (`#toggle-api-drawer-btn`):** sinaliza o estado real do modelo selecionado (ex.: `Configurar API Key`, `gemini-3.6-flash · 2.1s`, `gemini-3.8-flash · 503` ou `cota 429`) e abre/fecha a gaveta de credenciais.
  - **Alternador de Tema (`#theme-toggle-btn`):** alterna entre o padrão **OLED Pulse Dark** (`#050505`) e o modo **Papel Claro** (`#f7f5f5`) usando `light-dark()` e transição suave via **View Transitions API**.
- **Cofre Colapsável Google Gemini BYOK (`#api-drawer`):**
  - Link direto para geração gratuita de credencial no Google AI Studio (`aistudio.google.com/apikey`).
  - Consulta automaticamente `/v1beta/models` para listar os modelos compatíveis da chave informada (`#model-selector`, respeitando rigorosamente o modelo escolhido pelo usuário, **sem troca automática de modelo**).
  - **Verificador de Saúde em Tempo Real (`#test-model-btn` + `#model-health-strip`):** dispara automaticamente (ao trocar o modelo) ou sob demanda um ping SSE ultraleve (~8 tokens) para aferir TTFT (1º sinal), latência total, cota e eventuais filas/sobrecargas (`HTTP 503`) nos servidores do Google, com opção de cancelamento imediato.
  - Permite visualizar/ocultar (`#peek-api-key-btn`), validar e salvar localmente a `API Key` (`#save-api-key-btn`) ou apagá-la do navegador com 1 clique (`#clear-api-key-btn`).

### 2.2. Hero & Console Principal de Comando (`<section id="inicio">` + `#resumir`)
- **Bloco Editorial & Monitor da Marca (`.hero__copy` + `<figure class="monitor">`):** apresenta a proposta de valor (`<h1>` único) ao lado de um monitor de estúdio com sinal `SINAL MULTIMODAL`, marcador de capítulos e curva **ECG** animada em SVG.
- **Console de Entrada (`#summarize-form`):**
  - **Barra de URL (`#youtube-url-input`):** aceita links `watch?v=`, `youtu.be/`, `shorts/`, `live/`, `embed/` ou o ID puro de 11 caracteres, com botões rápidos de **Colar** da área de transferência (`#paste-url-btn`), **Limpar** (`#clear-url-btn`) e **Resumir vídeo** (`#analyze-submit-btn`).
  - **Preview Instantâneo oEmbed (`#detected-video-strip`):** assim que o link é digitado/colado, busca título, canal e miniatura sem consumir tokens da IA.
  - **4 Lentes de Síntese (`.mode-pills`):**
    1. **Executivo (`executive`):** tese central, pilares lógicos e conclusão rápida para tomada de decisão.
    2. **Aula & estudo (`deep_study`):** apostila teórica exaustiva sem lacunas, formalizando definições, mecanismos, fórmulas e exemplos.
    3. **Insights práticos (`actionable`):** foco em *frameworks*, ferramentas citadas, passos aplicáveis e resolução.
    4. **Roteiro temporal (`chronological`):** índice sequencial minucioso bloco a bloco com descrição visual de tela.
  - **Idioma de Saída (`#output-lang-select`):** gera o estudo em **Português (PT-BR)**, **Inglês (EN)** ou **Espanhol (ES)** independentemente do idioma falado no vídeo.
  - **Gaveta "Foco & Plano B" (`#advanced-drawer`):**
    - *Foco específico (`#custom-focus-input`):* direciona a atenção do modelo para um aspecto desejado (ex.: fórmulas, bibliotecas ou diagramas).
    - *Plano B — Transcrição manual (`#manual-transcript-input`):* contingência para vídeos privados, restritos ou não listados; compacta automaticamente legendas copiadas do YouTube preservando *timestamps* periódicos.
- **Testes em 1 Clique (`.samples-row`) & Indicadores (`.hero__facts`):** *chips* de demonstração imediata com aulas reais e resumo das métricas da plataforma.

### 2.3. Palco Vivo da Aplicação (`<section id="app">`)
Permanece recolhido enquanto ocioso e expande dinamicamente durante e após a leitura:

1. **Banner de Alerta & Contingência (`#error-banner`):** exibe diagnósticos claros e diferencia indisponibilidade temporária do servidor (`HTTP 429/503`) de restrição de acesso ao vídeo — abrindo automaticamente a gaveta do **Plano B** quando detecta vídeo privado/não listado.
2. **Monitor de Processamento em Streaming SSE (`#processing-card`):**
   - Conecta ao endpoint `:streamGenerateContent?alt=sse` exibindo batimento ao vivo (`#processing-live-pill`), cronômetro (`#elapsed-timer`), contagem de caracteres recebidos em tempo real, tópico atualmente redigido pelo modelo, progresso em 3 etapas (`01 Indexando`, `02 Estruturando`, `03 Transmitindo`) e botão **Cancelar** (`#cancel-analyze-btn` via `AbortController`).
3. **Workspace Dividido (`#workspace-grid`):**
   - **Coluna Esquerda *Sticky* — Player & Telemetria (`<aside class="media">`):**
     - Player `youtube-nocookie.com` sincronizado (`#youtube-iframe-player`) + link externo direto.
     - Categoria inferida, título, canal e **Medidor de Economia de Tempo** (comparativo visual entre duração do vídeo e minutos de estudo).
     - **Faixa de Telemetria (`.telemetry`):** modelo utilizado, latência total em segundos e consumo de tokens (com *tooltip* detalhando entrada, saída e perfil de amostragem FPS).
   - **Coluna Direita — Dossiê de Estudo Multi-Abas (`<article class="output">`):**
     - **Barra Superior (`.output__toolbar`):** seletor das 3 abas principais + ações globais de **Copiar Markdown** (`#copy-markdown-btn`) e **Baixar `.md`** (`#download-markdown-btn`).
     - **Aba 1 · Resumo Teórico (`#summary-pane`):**
       - `TL;DR` — *Fundamentação & visão geral* + nota de pré-requisitos e público-alvo.
       - `DEF` — *Glossário de conceitos & fórmulas* (`#summary-glossary-block`): cartões dedicados para termos formais, teoremas e equações.
       - `KEY` — *Módulos & pontos-chave* (`#summary-keypoints`): desenvolvimento completo numerado com listas, blocos de código, fórmulas inline e botões de salto temporal.
       - `CAP` — *Capítulos cronológicos* (`#summary-timeline`): linha do tempo clicável com indicação do que apareceu nos slides/quadro (`Quadro/Slide: ...`).
       - `END` — *Aplicação prática & revisão* (`#summary-takeaways` + `#summary-conclusion`): pontos de atenção, armadilhas comuns e síntese integradora.
     - **Aba 2 · Mapa Mental Interativo (`#mindmap-pane`):**
       - Gerado instantaneamente com **zero consumo extra de tokens** a partir da estrutura do resumo.
       - **Canvas Vetorial (`#mm-canvas-wrap`):** *pan* por arraste, *zoom* centrado no cursor (`28%` a `240%`), ajuste automático à tela (`#mm-fit-btn`), recolhimento global de ramos para revisão por **Active Recall** (`#mm-collapse-all-btn`), restauração (`#mm-reset-btn`) e salto direto no vídeo ao clicar no badge `▶ MM:SS` de qualquer nó.
       - **Inspetor & Construtor de Nós (`#mm-inspector`):** permite editar título, *timecode* e notas de estudo de qualquer nó (persistindo no histórico local), criar sub-nós manuais (`+ Sub-nó`), excluir ramos, saltar para o minuto do nó ou acionar **✦ Expandir c/ IA** (`#mm-ai-expand-btn`) para gerar de 3 a 6 subconceitos aprofundados sob demanda.
       - **Exportação Gráfica:** download direto em **SVG vetorial** (`#mm-export-svg-btn`) ou **PNG HD Retina 2.5×** (`#mm-export-png-btn`).
     - **Aba 3 · Perguntar ao Vídeo (`#qa-pane`):**
       - *Chips* de perguntas rápidas (ferramentas citadas, leitura de slides, geração de quiz de revisão com gabarito) + chat multi-turno com renderização de Markdown acadêmico e *timestamps* clicáveis.
       - **Modo Econômico Inteligente:** responde com base no dossiê estruturado (~98% menos tokens); se o usuário mencionar um minuto na pergunta (ex.: `14:20`), recorta e inspeciona automaticamente apenas o clipe `[t − 45s, t + 90s]` do vídeo; ou permite marcar **Reinspecionar vídeo completo** (`#qa-force-video-toggle`).
4. **Biblioteca Recente (`<section id="history-section">`):** grade de cartões com os últimos até 12 vídeos resumidos salvos no dispositivo, permitindo reabrir instantaneamente resumo + mapa mental editado ou limpar o histórico (`#clear-history-btn`).

### 2.4. Seções Informativas da Landing Page & Rodapé
- **`00:01` Como funciona (`#como-funciona`):** explica a jornada em 3 cortes (*Entrada*, *Pulso Multimodal* e *Estudo Ativo*).
- **`00:02` Recursos (`#recursos`):** *Bento Grid* detalhando sincronia de *timestamps*, visão além da legenda, mapa mental zero-token, glossário técnico, tutor por janela temporal e arquitetura *local-first*.
- **`00:03` Modos de síntese (`#modos`):** apresentação comparativa dos 4 modos (`A`–`D`) com botões interativos `[data-select-mode]` que ativam o modo escolhido e levam o foco direto ao console `#resumir`.
- **`00:04` Para quem (`#para-quem`):** aplicações práticas para estudantes/concurseiros, engenheiros/devs, líderes/produto e pesquisadores/criadores.
- **`00:05` Perguntas frequentes (`#faq`):** acordeão nativo (`<details name="faq">`) sincronizado 1:1 com o schema `FAQPage` para *Rich Results* em buscadores.
- **CTA Final (`.cta`) & Rodapé (`<footer class="site-footer">`):** chamada final para conversão imediata (`[data-focus-input]`), links de navegação rápida e informações legais.

---

## 3. Arquitetura de Pastas e Função de Cada Arquivo

```text
pulsetube-videoresume/
├── index.html                        # Documento HTML5 semântico: Landing Page + App + Sprite SVG + JSON-LD
├── .env.example                      # Modelo de variável opcional apenas para desenvolvimento local
├── package.json                      # Manifesto Node, scripts Vite 8 e alvos Browserslist
├── vite.config.js                    # Configuração Vite + compilação/minificação via Lightning CSS
├── favicon.svg                       # Ícone vetorial da marca na raiz
├── robots.txt                        # Diretivas de indexação para crawlers e apontamento do Sitemap
├── sitemap.xml                       # Mapa XML canônico da página
├── site.webmanifest                  # Manifesto PWA (ícones, cores OLED e modo standalone)
├── assets/
│   └── brand/                        # Arte-fonte oficial da logo, recorte hero e ícones derivados
├── public/                           # Ativos estáticos copiados na raiz do build de produção (dist/)
│   ├── _headers                      # Cabeçalhos HTTP de segurança (Cloudflare Pages / Netlify)
│   ├── favicon.svg                   # Favicon SVG adaptativo
│   ├── og-image.jpg                  # Card Open Graph / Twitter (1200×630)
│   ├── icon-192.png / icon-512.png   # Ícones PWA de alta densidade
│   ├── apple-touch-icon.png          # Ícone iOS/Safari (180×180)
│   ├── robots.txt / sitemap.xml      # Metadados públicos de indexação
│   └── site.webmanifest              # Web App Manifest servido em produção
├── css/                              # Sistema de estilos modular organizado em Cascade Layers (@layer)
│   ├── main.css                      # Ponto de entrada CSS: declara a ordem das @layer e importa os módulos
│   ├── tokens.css                    # Design tokens (paleta OLED Pulse Studio, oklch, light-dark, tipografia, raios)
│   ├── base.css                      # Reset moderno, tipografia global, helpers A11y, View Transitions e keyframes
│   ├── components.css                # Botões, status pills, chips, inputs, badges de timecode e divisor .pulse-rule
│   ├── header.css                    # Cabeçalho fixo, barra scrubber de scroll, menu popover e gaveta da API
│   ├── hero.css                      # Grid do Hero, monitor da marca com ECG animado, console de URL e preview
│   ├── feedback.css                  # Banner de erro, monitor de streaming em tempo real e notificações toast
│   ├── workspace.css                 # Layout split: player sticky, economia de tempo, telemetria e resumo teórico
│   ├── mindmap.css                   # Barra de ferramentas, canvas vetorial SVG e inspetor de nós do Mapa Mental
│   ├── qa.css                        # Interface do chat "Perguntar ao vídeo", sugestões e toggle de vídeo bruto
│   ├── history.css                   # Grade responsiva da Biblioteca Recente salva no navegador
│   ├── landing.css                   # Seções 00:01–00:05 (Capítulos, Bento Grid, Modos, Público, FAQ, CTA e Footer)
│   └── responsive.css                # Ajustes finos para tablets/celulares e folha de estilo @media print
└── js/                               # Aplicação modular em ES Modules nativos (sem frameworks pesados)
    ├── main.js                       # Orquestrador principal: inicialização, eventos, streaming, abas e histórico
    ├── config/
    │   └── constants.js              # Chaves de storage, lista de modelos, perfis FPS, prompts de modo e thinkingBudget
    ├── state/
    │   └── store.js                  # Estado centralizado da sessão (vídeo ativo, resultado, histórico Q&A, timers)
    ├── services/
    │   ├── geminiService.js          # Cliente REST/SSE: descoberta de modelos, sonda de saúde em tempo real e streaming
    │   ├── promptBuilder.js          # Engenharia de prompt pedagógico, JSON Schema, compactador de transcrição e Q&A
    │   ├── mindMapService.js         # Síntese 0-token do Mapa Mental, CRUD de nós e expansão sob demanda com IA
    │   ├── youtubeService.js         # Extração resiliente de IDs do YouTube, URLs embed e metadados via noembed
    │   └── storageService.js         # Persistência resiliente BYOK em localStorage (API Key, remoção, tema e biblioteca)
    ├── ui/
    │   ├── dom.js                    # Mapeamento centralizado de todas as referências de elementos do DOM
    │   ├── components.js             # Renderizador seguro de Markdown acadêmico (código, listas, negrito e timecodes)
    │   ├── playerController.js       # Preview de URL detectada e controle/seek sem reload do iframe do YouTube
    │   ├── processingView.js         # Telemetria visual ao vivo das fases de conexão, raciocínio e streaming SSE
    │   ├── summaryView.js            # Renderização do dossiê teórico (TL;DR, Glossário, Módulos, Capítulos, Conclusão)
    │   ├── mindMapView.js            # Controlador interativo de pan/zoom, Active Recall e edição no Mapa Mental
    │   ├── qaView.js                 # Renderização de mensagens do tutor Q&A com timestamps clicáveis
    │   ├── historyView.js            # Renderização e seleção dos cartões da Biblioteca Recente
    │   └── notifications.js          # Gerenciamento de tema, status dot da API, banners de erro e toasts
    └── utils/
        ├── formatters.js             # Sanitização XSS (escapeHtml), conversão MM:SS → segundos e slugs de arquivo
        ├── markdownExporter.js       # Construção de documento Markdown completo (.md), cópia e download
        └── mindMapExporter.js        # Motor determinístico de layout SVG em árvore e exportador SVG / PNG Retina 2.5×
```

---

## 4. Engenharia Multimodal, Segurança BYOK & SEO Técnico

| Pilar | Implementação no Projeto |
| :--- | :--- |
| **Segurança BYOK & Sanitização XSS** | Nenhuma credencial é embutida no bundle de produção (`DEFAULT_API_KEY = ''`). Todo texto retornado pelo LLM é higienizado com `escapeHtml` antes da formatação de Markdown acadêmico e SVG, acompanhado de cabeçalhos HTTP de segurança (`public/_headers` + `strict-origin-when-cross-origin`). |
| **Amostragem Visual Inteligente** | Vídeos são lidos a `0.2 fps` (1 quadro a cada 5s) + 100% do fluxo de áudio contínuo, preservando total nitidez de slides e códigos com **~75% de economia de tokens visuais**. Para aulas muito longas (2h–3h+) que excedam a janela, há *fallback* automático para `0.1 fps` + `MEDIA_RESOLUTION_LOW`. |
| **Streaming SSE & Sonda de Saúde** | `geminiService.js` consome `:streamGenerateContent?alt=sse` e inclui `probeGeminiModelHealth` (~8 tokens) para medir em tempo real TTFT, latência total, disponibilidade de cota (`HTTP 429`) e sobrecarga do servidor (`HTTP 503`). |
| **Fidelidade Estrita ao Modelo** | O cliente respeita 100% o modelo escolhido no seletor (`#model-selector`) — sem troca automática silenciosa — aplicando `thinkingConfig` calibrado por modo em toda a família `gemini-3.x`. |
| **Q&A com Recorte Cirúrgico** | Perguntas gerais consultam o dossiê teórico já extraído (~2k–4k tokens, poupando ~98%). Quando a pergunta menciona um minuto (`12:30`), `promptBuilder.js` anexa apenas o trecho `[t − 45s, t + 90s]` a `0.5 fps` via `videoMetadata`. |
| **Mapa Mental Imune a CORS** | `mindMapExporter.js` calcula o layout vetorial completo com estilos inline puros (sem `<foreignObject>`), permitindo rasterização limpa em HTML5 `<canvas>` a `2.5×` DPI para exportação PNG HD em qualquer navegador. |
| **SEO & Dados Estruturados** | HTML5 com hierarquia semântica rigorosa, `canonical`, Open Graph / Twitter Cards e grafo **JSON-LD (`Schema.org`)** integrando `Organization`, `WebSite`, `WebApplication` e `FAQPage`. |

---

## 5. Como Executar, Configurar e Publicar (Deploy)

### Pré-requisitos
- **Node.js** `18+` (recomendado `20+` ou superior)
- Uma chave gratuita da **Google Gemini API** gerada no [Google AI Studio](https://aistudio.google.com/apikey) — informada pelo próprio usuário diretamente na gaveta superior da interface.
  - *Opcional apenas para desenvolvimento local:* copie `.env.example` para `.env.local` (ignorado pelo Git) e preencha `VITE_GEMINI_API_KEY=...`.

### Instalação e Desenvolvimento (HMR)

```bash
npm install
npm run dev
```

### Build de Produção e Pré-visualização

O comando de build executa o **Vite 8 (Rolldown)** em conjunto com o **Lightning CSS**, unificando todos os módulos `@layer`, transpilando `oklch()`, `light-dark()` e *CSS Nesting* para os navegadores definidos em `browserslist` e gerando o pacote otimizado na pasta `dist/`:

```bash
npm run build
npm run preview
```

### Checklist de Publicação na Internet (Vercel, Netlify ou Cloudflare Pages)

1. **Comando de Build:** `npm run build` · **Diretório de saída:** `dist`.
2. **Não configure `VITE_GEMINI_API_KEY` no painel de produção:** na arquitetura **BYOK**, o bundle público deve sair sem chave pré-gravada para que cada visitante utilize sua própria chave no navegador.
3. **Atualize o domínio canônico:** substitua `https://pulsetube.ai/` pela sua URL final em `index.html`, `public/robots.txt` e `public/sitemap.xml`.
4. **Dica extra de segurança para sua chave pessoal:** no [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), você pode restringir sua chave pessoal por **HTTP Referrers** (ex.: `https://seu-dominio.com/*` e `http://localhost:5173/*`).
