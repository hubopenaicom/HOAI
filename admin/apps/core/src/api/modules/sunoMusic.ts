import api from '../index';

export default {
  adminQueryJobs: (params: Record<string, unknown>) =>
    api.get('music/suno/admin/jobs', { params }),
};
