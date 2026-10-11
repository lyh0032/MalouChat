import { useEffect, useMemo, useRef, useState } from 'react'
import { MenuOutlined } from '@ant-design/icons'
import {
  AnimatePresence,
  domAnimation,
  LazyMotion,
  m,
  MotionConfig,
  type Variants
} from 'motion/react'

import type { Message } from '../../types/chat'
import { markdownToPlainText } from '../../utils/markdown'

import './QuestionDots.css'

const TOUCH_DISMISS_DELAY = 2000
const HOVER_MEDIA_QUERY = '(hover: hover) and (pointer: fine)'
const LAYOUT_SPRING = { type: 'spring' as const, stiffness: 430, damping: 38, mass: 0.72 }

const panelVariants: Variants = {
  hidden: {
    opacity: 0,
    x: 18,
    scale: 0.96,
    filter: 'blur(8px)'
  },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.28,
      ease: [0.22, 1, 0.36, 1],
      when: 'beforeChildren',
      delayChildren: 0.04,
      staggerChildren: 0.035
    }
  },
  exit: {
    opacity: 0,
    x: 16,
    scale: 0.96,
    filter: 'blur(7px)',
    transition: {
      duration: 0.2,
      ease: [0.4, 0, 1, 1],
      when: 'afterChildren',
      staggerChildren: 0.018,
      staggerDirection: -1
    }
  }
}

const titleVariants: Variants = {
  hidden: { opacity: 0, x: 10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
  },
  exit: {
    opacity: 0,
    x: 8,
    transition: { duration: 0.12, ease: 'easeIn' }
  }
}

export default function QuestionDots({ messages }: { messages: Message[] }) {
  const questions = useMemo(
    () =>
      messages
        .filter((message) => message.role === 'user')
        .map((message) => ({
          id: message.id,
          title: markdownToPlainText(message.content) || '附件消息'
        })),
    [messages]
  )
  const [expanded, setExpanded] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [hoverCapable, setHoverCapable] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(HOVER_MEDIA_QUERY).matches
  )
  const rootRef = useRef<HTMLDivElement>(null)
  const dismissTimer = useRef<number | undefined>(undefined)

  function clearDismissTimer() {
    window.clearTimeout(dismissTimer.current)
  }

  function closeNavigation() {
    clearDismissTimer()
    setExpanded(false)
    setActiveIndex(-1)
  }

  function scheduleTouchDismiss() {
    if (hoverCapable) return
    clearDismissTimer()
    dismissTimer.current = window.setTimeout(closeNavigation, TOUCH_DISMISS_DELAY)
  }

  function openNavigation() {
    clearDismissTimer()
    setExpanded(true)
    if (!hoverCapable) scheduleTouchDismiss()
  }

  useEffect(() => {
    const media = window.matchMedia(HOVER_MEDIA_QUERY)
    const syncInputMode = () => {
      setHoverCapable(media.matches)
      closeNavigation()
    }
    media.addEventListener('change', syncInputMode)
    return () => media.removeEventListener('change', syncInputMode)
  }, [])

  useEffect(() => {
    if (!expanded) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) closeNavigation()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeNavigation()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [expanded])

  useEffect(() => () => clearDismissTimer(), [])

  function scrollToMessage(messageId: string) {
    document.getElementById(`message-${messageId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    })
    closeNavigation()
  }

  if (questions.length < 2) return null

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <div
          ref={rootRef}
          className="question-dots"
          onMouseEnter={() => {
            if (hoverCapable) openNavigation()
          }}
          onMouseLeave={() => {
            if (hoverCapable) closeNavigation()
          }}
          onFocusCapture={openNavigation}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeNavigation()
          }}
        >
          <m.aside
            layout="size"
            className={`question-dots-surface${expanded ? ' is-expanded' : ''}`}
            transition={{ layout: LAYOUT_SPRING }}
            aria-label="对话问题目录"
          >
            <div className="question-dots-trigger-slot">
              <m.button
                className="question-dots-trigger"
                type="button"
                aria-label="展开问题目录"
                aria-controls="question-title-list"
                aria-expanded={expanded}
                initial={false}
                animate={
                  expanded
                    ? { opacity: 0, x: 5, scale: 0.86 }
                    : { opacity: 1, x: 0, scale: 1 }
                }
                transition={{ duration: 0.16, ease: 'easeOut' }}
                style={{ pointerEvents: expanded ? 'none' : 'auto' }}
                onClick={openNavigation}
              >
                <MenuOutlined />
              </m.button>
            </div>

            <AnimatePresence initial={false}>
              {expanded ? (
                <m.nav
                  key="question-titles"
                  id="question-title-list"
                  className="question-title-list"
                  variants={panelVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  onPointerMove={scheduleTouchDismiss}
                  onScroll={scheduleTouchDismiss}
                >
                  {questions.map((question, index) => (
                    <m.button
                      key={question.id}
                      className={`question-title-item${activeIndex === index ? ' is-active' : ''}`}
                      type="button"
                      variants={titleVariants}
                      aria-label={`跳转到问题：${question.title}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseLeave={() => setActiveIndex(-1)}
                      onFocus={() => setActiveIndex(index)}
                      onClick={() => scrollToMessage(question.id)}
                    >
                      <span className="question-title-index">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="question-title-text">{question.title}</span>
                    </m.button>
                  ))}
                </m.nav>
              ) : null}
            </AnimatePresence>
          </m.aside>
        </div>
      </LazyMotion>
    </MotionConfig>
  )
}
