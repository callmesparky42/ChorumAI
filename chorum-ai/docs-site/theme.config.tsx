import React from 'react'
import { DocsThemeConfig } from 'nextra-theme-docs'

const config: DocsThemeConfig = {
    logo: (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <img src="/docs/chorumai.png" alt="Chorum AI" style={{ height: '32px' }} />
            <span style={{ fontWeight: 600 }}>Docs</span>
        </span>
    ),
    project: {
        link: 'https://github.com/callmesparky42/ChorumAI',
    },
    docsRepositoryBase: 'https://github.com/callmesparky42/ChorumAI/tree/main/docs-site',
    footer: {
        content: (
            <span style={{ color: '#a1a1aa' }}>
                ❤ 50% of donations support World Central Kitchen
            </span>
        ),
    },
    head: (
        <>
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <meta property="og:title" content="Chorum AI Documentation" />
            <meta property="og:description" content="Multi-provider LLM orchestration with intelligent routing and sovereign memory." />
            <link rel="icon" href="/docs/favicon.ico" />
        </>
    ),
    primaryHue: 195, // Azure hue
    primarySaturation: 80,
    useNextSeoProps() {
        return {
            titleTemplate: '%s – Chorum AI Docs'
        }
    },
    sidebar: {
        defaultMenuCollapseLevel: 1,
        toggleButton: true,
    },
    toc: {
        component: () => null, // Hide "On This Page" section
    },
    darkMode: false, // Force dark mode
    nextThemes: {
        defaultTheme: 'dark',
        forcedTheme: 'dark',
    },
}

export default config
