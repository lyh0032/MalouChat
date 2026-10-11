import { useEffect, useRef, useState } from 'react'
import { Button, Card, Form, Input } from 'antd'
import { Link, useLocation, useNavigate } from 'react-router-dom'

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

const authModeOptions = [
  { value: 'login', label: '登录' },
  { value: 'register', label: '注册' }
] satisfies Array<{ value: AuthMode; label: string }>

export default function LoginView() {
  const location = useLocation()
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const loginAsGuest = useAuthStore((state) => state.loginAsGuest)
  const register = useAuthStore((state) => state.register)
  const [form] = Form.useForm<LoginFormValues & RegisterFormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [guestSubmitting, setGuestSubmitting] = useState(false)
  const guestLoginInFlightRef = useRef(false)
  const isRegisterMode = location.pathname === '/register'
  const authMode: AuthMode = isRegisterMode ? 'register' : 'login'

  const intro = isRegisterMode
    ? {
        eyebrow: 'Create Account',
        title: '创建你的 MalouChat 账号',
        description: '注册后即可保存聊天历史和长期记忆。'
      }
    : {
        eyebrow: 'AI Chat Workspace',
        title: '登录到 MalouChat',
        description: '继续查看历史会话、个性记忆和聊天记录。'
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
        form.setFields([{ name: 'password', errors: ['账号或密码错误'] }])
      } else if (errorCode === 'EMAIL_TAKEN') {
        form.setFields([{ name: 'email', errors: ['邮箱已被使用'] }])
      } else if (errorCode === 'USERNAME_TAKEN') {
        form.setFields([{ name: 'username', errors: ['用户名已被使用'] }])
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
      <AuthThemeToggle />

      <main className="auth-page">
        <div className="auth-shell">
          <Card className="auth-card" variant="borderless">
            <MalouBrand className="auth-brand" />

            <LiquidGlassSwitch
              className="auth-mode-switch"
              value={authMode}
              options={authModeOptions}
              onChange={handleAuthModeChange}
              ariaLabel="认证方式"
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
                    label="邮箱"
                    name="email"
                    rules={[
                      { required: true, message: '请输入邮箱' },
                      { type: 'email', message: '邮箱格式不正确' }
                    ]}
                  >
                    <Input placeholder="请输入邮箱" autoComplete="email" />
                  </Form.Item>
                  <Form.Item
                    label="用户名"
                    name="username"
                    rules={[
                      { required: true, message: '请输入用户名' },
                      { min: 3, max: 24, message: '用户名长度应在 3 到 24 位之间' },
                      {
                        validator: (_, value: string) =>
                          /^visitor_\d+$/i.test(value?.trim() || '')
                            ? Promise.reject(new Error('Visitor_数字格式为系统访客保留'))
                            : Promise.resolve()
                      }
                    ]}
                  >
                    <Input placeholder="请输入用户名" autoComplete="username" />
                  </Form.Item>
                </>
              ) : (
                <Form.Item
                  label="邮箱或用户名"
                  name="emailOrUsername"
                  rules={[{ required: true, message: '请输入邮箱或用户名' }]}
                >
                  <Input placeholder="请输入邮箱或用户名" autoComplete="username" />
                </Form.Item>
              )}

              <Form.Item
                label="密码"
                name="password"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 3, max: 128, message: '密码长度应在 3 到 128 位之间' }
                ]}
              >
                <Input.Password
                  placeholder="请输入密码"
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
                  注册
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
                    访客登录
                  </Button>
                  <Button
                    className="auth-card-submit"
                    type="primary"
                    htmlType="submit"
                    loading={submitting}
                    disabled={guestSubmitting}
                  >
                    登录
                  </Button>
                </div>
              )}
            </Form>
          </Card>

          <Link className="auth-architecture-entry" to="/architecture">
            <span className="auth-architecture-entry-dot" />
            <span>查看产品与技术架构</span>
          </Link>
        </div>
      </main>
    </div>
  )
}
