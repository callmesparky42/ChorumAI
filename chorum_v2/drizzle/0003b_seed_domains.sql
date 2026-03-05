-- System domain seeds — shipped with Chorum v2
-- These are LLM-readable hints, not fixed categories.

INSERT INTO domain_seeds (label, signal_keywords, preferred_types, is_system) VALUES
(
  'coding',
  '["code", "function", "bug", "API", "database", "TypeScript", "Python", "deploy", "git", "test", "refactor", "performance", "algorithm", "variable", "class", "method"]',
  '{"invariant": 1.0, "anchor": 1.0, "pattern": 0.9, "decision": 0.8, "golden_path": 0.7, "antipattern": 0.6}',
  true
),
(
  'writing',
  '["character", "plot", "scene", "dialogue", "voice", "setting", "world", "story", "narrative", "chapter", "draft", "revision", "tone", "POV", "protagonist"]',
  '{"character": 1.0, "world_rule": 1.0, "anchor": 1.0, "plot_thread": 0.9, "voice": 0.8, "setting": 0.7}',
  true
),
(
  'trading',
  '["trade", "market", "position", "risk", "strategy", "signal", "indicator", "portfolio", "hedge", "volatility", "entry", "exit", "stop-loss", "momentum", "backtest"]',
  '{"invariant": 1.0, "anchor": 1.0, "decision": 0.9, "pattern": 0.8, "antipattern": 0.7, "golden_path": 0.6}',
  true
);
