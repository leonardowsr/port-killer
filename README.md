# 🔌 Port Killer CLI

CLI interativo para fechar portas de processos no Linux com estilo.

![Port Killer Demo](https://placehold.co/600x400/1a1a2e/e94560?text=Port+Killer+CLI)

## ✨ Features

- 🎯 Interface interativa com checkboxes para selecionar múltiplas portas
- 🎨 Cores e ícones para diferentes tipos de processos (Node, Python, Docker, DBs)
- 📁 Detecta automaticamente projetos e diretórios
- ⏱️ Mostra uptime dos processos
- 🔒 Oculta portas de sistema (< 1000) por padrão
- ⌨️ Pressione **ESC** para sair a qualquer momento

## 🚀 Instalação

```bash
npm install -g port-killer
```

Ou use diretamente com `npx`:

```bash
npx port-killer
```

## 📦 Upgrade

```bash
npm update -g port-killer
```

## 💡 Uso

```bash
pk
```

### Opções

| Flag | Descrição |
|------|-----------|
| `-a, --all` | Mostrar todas as portas (inclui as de sistema) |
| `-h, --help` | Mostrar ajuda |

### Atalhos

- **Space** - Marcar/desmarcar porta
- **Enter** - Confirmar seleção
- **↑↓** - Navegar na lista
- **ESC** - Sair

## 🖥️ Demo

```
  ┌─────────────────────────────────┐
  │   🔌  Port Killer CLI            │
  │   Feche portas com estilo        │
  └─────────────────────────────────┘
  Pressione ESC para sair a qualquer momento

  2 porta(s) de sistema oculta(s) — use pk --all pra ver tudo

  TCP | UDP | 3 total

 PORTA  PROTO PROCESSO       PROJETO/DIR        TEMPO
──────────────────────────────────────────────────────────────────
 3000   TCP  node             my-app              2h 15m  
 5173   TCP  vite             frontend            45m   
 5432   TCP  postgres         meu-projeto         1d 3h  
```

## 📋 Requisitos

- Linux (com comando `ss` disponível)
- Node.js 18+
- npm ou bun

## 📝 Licença

MIT © [LeonardoWSR](https://github.com/leonardowsr)