export type Locale = "en-US" | "zh-CN";

export const supportedLocales: readonly Locale[] = ["en-US", "zh-CN"] as const;

export const defaultLocale: Locale = "zh-CN";

type Dictionary = Record<string, unknown>;

const dictionaries: Record<Locale, Dictionary> = {
  "en-US": {
    common: {
      language: "Language",
      theme: "Theme",
      light: "Light",
      dark: "Dark",
    },
    nav: {
      home: "Home",
      dashboard: "Dashboard",
      support: "Support",
      logout: "Logout",
    },
    login: {
      title: "Login",
      description: "Enter your email below to log in to your account.",
      username: "Username",
      password: "Password",
      forgotPassword: "Forgot your password?",
      signIn: "Sign In",
      noAccount: "Don't have an account?",
      signUp: "Sign up",
    },
    register: {
      title: "Sign Up",
      description: "Enter your email and password below to create your account.",
      email: "Email",
      password: "Password",
      submit: "Sign Up",
      backToLogin: "Back to login",
    },
    passwordRecovery: {
      title: "Password Recovery",
      description:
        "Enter your email to receive instructions to reset your password.",
      email: "Email",
      send: "Send",
      backToLogin: "Back to login",
      loading: "Loading reset form...",
      resetTitle: "Reset your Password",
      resetDescription: "Enter the new password and confirm it.",
      password: "Password",
      passwordConfirm: "Password Confirm",
    },
    dashboard: {
      title: "Dashboard",
      placeholder:
        "This is the placeholder dashboard for Anyreason. Next steps: project lifecycle, provider/model management, assets, canvas and storyboards.",
    },
  },
  "zh-CN": {
    common: {
      language: "语言",
      theme: "主题",
      light: "浅色",
      dark: "深色",
    },
    nav: {
      home: "主页",
      dashboard: "仪表盘",
      support: "支持",
      logout: "退出登录",
    },
    login: {
      title: "登录",
      description: "输入邮箱与密码登录你的账号。",
      username: "邮箱",
      password: "密码",
      forgotPassword: "忘记密码？",
      signIn: "登录",
      noAccount: "还没有账号？",
      signUp: "注册",
    },
    register: {
      title: "注册",
      description: "输入邮箱与密码创建账号。",
      email: "邮箱",
      password: "密码",
      submit: "注册",
      backToLogin: "返回登录",
    },
    passwordRecovery: {
      title: "找回密码",
      description: "输入邮箱以接收重置密码的指引。",
      email: "邮箱",
      send: "发送",
      backToLogin: "返回登录",
      loading: "正在加载重置表单…",
      resetTitle: "重置密码",
      resetDescription: "输入新密码并确认。",
      password: "密码",
      passwordConfirm: "确认密码",
    },
    dashboard: {
      title: "仪表盘",
      placeholder:
        "这里是「言之有理」的占位 Dashboard。下一步会逐步接入：项目生命周期、Provider/模型管理、资产管理、画布与分镜。",
    },
  },
};

export function resolveLocale(input: string | undefined | null): Locale {
  if (!input) return defaultLocale;

  const normalized = input.replace("_", "-").trim();
  const lower = normalized.toLowerCase();

  if (lower === "zh" || lower === "zh-cn") return "zh-CN";
  if (lower === "en" || lower === "en-us") return "en-US";

  if (supportedLocales.includes(normalized as Locale)) return normalized as Locale;

  return defaultLocale;
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}

function getValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function translate(locale: Locale, key: string): string {
  const dict = getDictionary(locale);
  const value = getValue(dict, key);
  if (typeof value === "string") return value;
  return key;
}
