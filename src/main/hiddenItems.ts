export interface IgnoreRule {
  dirs: string[]
  exts: string[]
  dot: boolean
}

/** 全局隐藏项规则表：标识 → 匹配规则 */
export const HIDDEN_ITEM_RULES: Record<string, IgnoreRule> = {
  unreal_gen: {
    dirs: ['Intermediate', 'Saved', 'Binaries', 'DerivedDataCache'],
    exts: [],
    dot: false
  },
  unity_meta: { dirs: [], exts: ['meta'], dot: false },
  unity_gen: {
    dirs: ['Library', 'Temp', 'Logs', 'UserSettings'],
    exts: [],
    dot: false
  },
  node_modules: { dirs: ['node_modules'], exts: [], dot: false },
  frontend_build: { dirs: ['dist', 'build', '.next', '.nuxt'], exts: [], dot: false },
  python_cache: {
    dirs: ['__pycache__', '.venv', 'venv', '.pytest_cache', '.mypy_cache'],
    exts: ['pyc'],
    dot: false
  },
  java_dotnet: {
    dirs: ['target', '.gradle', '.idea', 'bin', 'obj', '.vs', 'out'],
    exts: [],
    dot: false
  },
  dotfiles: { dirs: [], exts: [], dot: true },
  log_files: { dirs: [], exts: ['log'], dot: false }
}
