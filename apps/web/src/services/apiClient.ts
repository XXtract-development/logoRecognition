import axios from 'axios';
import { APP_CONFIG } from '../constants';

const apiClient = axios.create({
  baseURL: `${APP_CONFIG.apiBaseUrl}/api/v1`,
  timeout: 30000,
});

export default apiClient;
