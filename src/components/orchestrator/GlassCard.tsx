'use client'

import { motion, type MotionProps } from 'framer-motion'
import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface GlassCardProps extends MotionProps {
  children: ReactNode
  className?: string
  strong?: boolean
  hover?: boolean
}

export function GlassCard({
  children,
  className,
  strong,
  hover,
  ...rest
}: GlassCardProps) {
  return (
    <motion.div
      className={cn(
        strong ? 'glass-strong' : 'glass',
        hover && 'glass-hover',
        'rounded-2xl',
        className,
      )}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

export function GlassPanelHeader({
  icon,
  title,
  subtitle,
  accent = '#34d399',
  right,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  accent?: string
  right?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${accent}22`, color: accent }}
        >
          {icon}
        </span>
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-white/90">{title}</h3>
          {subtitle && (
            <p className="text-[11px] text-white/45">{subtitle}</p>
          )}
        </div>
      </div>
      {right}
    </div>
  )
}
