import { format } from 'date-fns'
import { uk } from 'date-fns/locale'

export function formatPostTime(iso: string) {
    return format(new Date(iso), 'dd/MM/yy EEE HH:mm:ss', { locale: uk })
}

export function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} Б`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Кб`
    return `${(bytes / (1024 * 1024)).toFixed(1)} Мб`
}
