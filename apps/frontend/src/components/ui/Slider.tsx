'use client'

import { useRef, useState, useEffect } from 'react'

interface SliderProps {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step: number
  disabled?: boolean
  className?: string
}

export function Slider({ value, onChange, min, max, step, disabled = false, className = '' }: Readonly<SliderProps>) {
  const sliderRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const percentage = ((value - min) / (max - min)) * 100

  const updateValue = (clientX: number) => {
    if (!sliderRef.current || disabled) return

    const rect = sliderRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    const rawValue = (x / rect.width) * (max - min) + min
    const steppedValue = Math.round(rawValue / step) * step
    const clampedValue = Math.max(min, Math.min(max, steppedValue))
    
    onChange(clampedValue)
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return
    setIsDragging(true)
    updateValue(e.clientX)
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      updateValue(e.clientX)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  return (
    <div
      ref={sliderRef}
      onMouseDown={handleMouseDown}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      className={`relative h-2 w-full cursor-pointer rounded-full ${
        disabled ? 'bg-slate-200 dark:bg-slate-700' : 'bg-slate-300 dark:bg-slate-600'
      } ${className}`}
    >
      {/* Progress bar */}
      <div
        className={`absolute h-full rounded-full transition-all ${
          disabled ? 'bg-slate-400 dark:bg-slate-600' : 'bg-[#03f3ef]'
        }`}
        style={{ width: `${percentage}%` }}
      />
      
      {/* Thumb */}
      <div
        className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all ${
          disabled
            ? 'border-slate-400 bg-slate-200 dark:border-slate-600 dark:bg-slate-700'
            : 'border-[#03f3ef] bg-white shadow-md hover:scale-110 dark:bg-slate-800'
        } ${isDragging ? 'scale-110' : ''}`}
        style={{ left: `${percentage}%` }}
      />
    </div>
  )
}
