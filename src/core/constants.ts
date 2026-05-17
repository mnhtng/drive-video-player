/** Application display name */
export const APP_NAME = 'Nimbus Player';

/** Prefix for OAuth-related keys in localStorage (used by react-oauth2-code-pkce) */
export const STORAGE_KEY_PREFIX = 'nimbus_player_';

/** sessionStorage key for storing pending file ID across OAuth redirect */
export const PENDING_FILE_KEY = 'nimbus_player_pending_file';

/** sessionStorage key for restoring route after OAuth redirect */
export const PENDING_LOCATION_KEY = 'nimbus_player_pending_location';

/** localStorage key prefix for saving video playback positions */
export const POSITION_KEY_PREFIX = 'nimbus_player_pos_';

/** Service Worker proxy path prefix */
export const PROXY_PREFIX = '/api/drive-proxy/';

/** Cache API namespace used by the Service Worker for token storage */
export const SW_AUTH_CACHE_NAME = 'nimbus-player-auth';

/** Cache key within SW_AUTH_CACHE_NAME for the access token */
export const SW_TOKEN_CACHE_KEY = '/__nimbus-player-access-token';

/** Standard video quality heights for Plyr quality selector & inference */
export const QUALITY_OPTIONS = [4320, 2880, 2160, 1440, 1080, 720, 576, 540, 480, 360, 240, 144];
