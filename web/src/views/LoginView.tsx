import { useTranslation } from 'react-i18next'
import { t } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { Button, Card, Form, Input } from 'antd'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import LanguageSelect from '../components/LanguageSelect'
import AuthThemeToggle from '../components/AuthThemeToggle'
import AnimatedBackground from '../components/AnimatedBackground'
import LiquidGlassSwitch from '../components/LiquidGlassSwitch'
import MalouBrand from '../components/MalouBrand'
import { useAuthStore } from '../stores/auth'

import './LoginView.css'

type AuthMode = 'login' | 'register'

type LoginFormValues = {
  emailOrUsername: string
  password: string
}

type RegisterFormValues = {
  email: string
  username: string
  password: string
}

type RequestError = Error & {
  status?: number
  payload?: {
    errorCode?: string
  }
}

export default function LoginView() {
  const authModeOptions = [
    { value: 'login', label: t('ui.signIn') },
    { value: 'register', label: t('ui.register') }
  ] satisfies Array<{ value: AuthMode; label: string }>

  const { i18n: uiI18n } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const loginAsGuest = useAuthStore((state) => state.loginAsGuest)
  const register = useAuthStore((state) => state.register)
  const [form] = Form.useForm<LoginFormValues & RegisterFormValues>()
  useEffect(() => {
    const fields = form
      .getFieldsError()
      .filter((field) => field.errors.length)
      .map((field) => field.name)
    if (fields.length) void form.validateFields(fields).catch(() => undefined)
  }, [form, uiI18n.language])
  const [submitting, setSubmitting] = useState(false)
  const [guestSubmitting, setGuestSubmitting] = useState(false)
  const guestLoginInFlightRef = useRef(false)
  const isRegisterMode = location.pathname === '/register'
  const authMode: AuthMode = isRegisterMode ? 'register' : 'login'

  const intro = isRegisterMode
    ? {
        eyebrow: 'Create Account',
        title: t('ui.createYourMalouchatAccount'),
        description: t('ui.registerToSaveConversationsAndLongTermMemories')
      }
    : {
        eyebrow: 'AI Chat Workspace',
        title: t('ui.signInToMalouchat'),
        description: t('ui.continueWithYourConversationsAndPersonalizedMemories')
      }

  useEffect(() => {
    form.resetFields()
  }, [authMode, form])

  function handleAuthModeChange(mode: AuthMode) {
    navigate(mode === 'register' ? '/register' : '/login')
  }

  async function handleSubmit(values: LoginFormValues & RegisterFormValues) {
    setSubmitting(true)

    try {
      if (isRegisterMode) {
        await register({
          email: values.email.trim(),
          username: values.username.trim(),
          password: values.password
        })
      } else {
        await login({
          emailOrUsername: values.emailOrUsername.trim(),
          password: values.password
        })
      }

      navigate('/chat', { replace: true })
    } catch (error) {
      const requestError = error as RequestError
      const errorCode = requestError.payload?.errorCode

      if (!isRegisterMode && requestError.status === 401) {
        form.setFields([{ name: 'password', errors: [t('ui.incorrectUsernameOrPassword')] }])
      } else if (errorCode === 'EMAIL_TAKEN') {
        form.setFields([{ name: 'email', errors: [t('ui.thisEmailIsAlreadyInUse')] }])
      } else if (errorCode === 'USERNAME_TAKEN') {
        form.setFields([{ name: 'username', errors: [t('ui.thisUsernameIsAlreadyInUse')] }])
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleGuestLogin() {
    if (guestLoginInFlightRef.current) return

    guestLoginInFlightRef.current = true
    setGuestSubmitting(true)

    try {
      await loginAsGuest()
      navigate('/chat', { replace: true })
    } finally {
      guestLoginInFlightRef.current = false
      setGuestSubmitting(false)
    }
  }

  return (
    <div className="auth-scene">
      <AnimatedBackground />
      <div className="auth-preferences">
        <LanguageSelect variant="auth" />
        <AuthThemeToggle />
      </div>

      <main className="auth-page">
        <div className="auth-shell">
          <Card className="auth-card" variant="borderless">
            <MalouBrand className="auth-brand" />

            <LiquidGlassSwitch
              className="auth-mode-switch"
              value={authMode}
              options={authModeOptions}
              onChange={handleAuthModeChange}
              ariaLabel={t('ui.authenticationMethod')}
            />

            <div className="auth-card-intro">
              <span className="auth-card-eyebrow">{intro.eyebrow}</span>
              <h1>{intro.title}</h1>
              <p>{intro.description}</p>
            </div>

            <Form
              form={form}
              layout="vertical"
              requiredMark
              autoComplete="on"
              onFinish={(values) => void handleSubmit(values)}
            >
              {isRegisterMode ? (
                <>
                  <Form.Item
                    label={t('ui.email')}
                    name="email"
                    rules={[
                      { required: true, message: t('ui.enterYourEmail') },
                      { type: 'email', message: t('ui.enterAValidEmailAddress') }
                    ]}
                  >
                    <Input placeholder={t('ui.enterYourEmail')} autoComplete="email" />
                  </Form.Item>
                  <Form.Item
                    label={t('ui.username')}
                    name="username"
                    rules={[
                      { required: true, message: t('ui.enterYourUsername') },
                      { min: 3, max: 24, message: t('ui.usernameMustBe3To24Characters') },
                      {
                        validator: (_, value: string) =>
                          /^visitor_\d+$/i.test(value?.trim() || '')
                            ? Promise.reject(
                                new Error(t('ui.theVisitorNumberFormatIsReservedForGuestAccounts'))
                              )
                            : Promise.resolve()
                      }
                    ]}
                  >
                    <Input placeholder={t('ui.enterYourUsername')} autoComplete="username" />
                  </Form.Item>
                </>
              ) : (
                <Form.Item
                  label={t('ui.emailOrUsername')}
                  name="emailOrUsername"
                  rules={[{ required: true, message: t('ui.enterYourEmailOrUsername') }]}
                >
                  <Input placeholder={t('ui.enterYourEmailOrUsername')} autoComplete="username" />
                </Form.Item>
              )}

              <Form.Item
                label={t('ui.password')}
                name="password"
                rules={[
                  { required: true, message: t('ui.enterYourPassword') },
                  { min: 3, max: 128, message: t('ui.passwordMustBe3To128Characters') }
                ]}
              >
                <Input.Password
                  placeholder={t('ui.enterYourPassword')}
                  autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
                />
              </Form.Item>

              {isRegisterMode ? (
                <Button
                  className="auth-card-submit"
                  type="primary"
                  htmlType="submit"
                  loading={submitting}
                  block
                >
                  {t('ui.register')}
                </Button>
              ) : (
                <div className="auth-card-actions">
                  <Button
                    className="auth-card-guest"
                    htmlType="button"
                    loading={guestSubmitting}
                    disabled={submitting}
                    onClick={() => void handleGuestLogin()}
                  >
                    {t('ui.continueAsGuest')}
                  </Button>
                  <Button
                    className="auth-card-submit"
                    type="primary"
                    htmlType="submit"
                    loading={submitting}
                    disabled={guestSubmitting}
                  >
                    {t('ui.signIn')}
                  </Button>
                </div>
              )}
            </Form>
          </Card>

          <Link className="auth-architecture-entry" to="/architecture">
            <span className="auth-architecture-entry-dot" />
            <span>{t('ui.exploreTheProductAndArchitecture')}</span>
          </Link>
        </div>
      </main>
    </div>
  )
}
