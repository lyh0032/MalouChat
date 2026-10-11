export type User = {
  id: string
  email: string
  username: string
  type: 'registered' | 'guest'
  isAdmin: boolean
  speechStyle: string
  createdAt: string
}

export type SpeechStyleInfo = {
  id: string
  name: string
}

export type AuthPayload = {
  token: string
  user: User
}

export type GuestAuthPayload = AuthPayload & {
  guestKey: string
}

export type LoginInput = {
  emailOrUsername: string
  password: string
}

export type RegisterInput = {
  email: string
  username: string
  password: string
}
