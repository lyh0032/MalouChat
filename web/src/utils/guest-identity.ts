const GUEST_IDENTITY_KEY = 'my-agent-guest-identity'

export type StoredGuestIdentity = {
  username: string
  guestKey: string
}

export function getStoredGuestIdentity(): StoredGuestIdentity | null {
  try {
    const rawValue = localStorage.getItem(GUEST_IDENTITY_KEY)
    if (!rawValue) return null

    const value = JSON.parse(rawValue) as Partial<StoredGuestIdentity>
    if (
      typeof value.username !== 'string' ||
      !/^Visitor_\d{4,}$/.test(value.username) ||
      typeof value.guestKey !== 'string' ||
      value.guestKey.length < 32
    ) {
      localStorage.removeItem(GUEST_IDENTITY_KEY)
      return null
    }

    return {
      username: value.username,
      guestKey: value.guestKey
    }
  } catch {
    localStorage.removeItem(GUEST_IDENTITY_KEY)
    return null
  }
}

export function setStoredGuestIdentity(identity: StoredGuestIdentity): void {
  localStorage.setItem(GUEST_IDENTITY_KEY, JSON.stringify(identity))
}
