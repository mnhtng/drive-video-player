export function formatFileSize(bytes: string | number): string {
    const b = typeof bytes === 'string' ? parseInt(bytes) : bytes;
    if (isNaN(b)) return 'Unknown';

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = b;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDuration(millis: string | number): string {
    const ms = typeof millis === 'string' ? parseInt(millis) : millis;
    if (isNaN(ms)) return '0:00';

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function isVideoMimeType(mimeType: string): boolean {
    return mimeType.startsWith('video/');
}
