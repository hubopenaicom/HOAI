import api from '../index';

export default {
  adminQueryJobs: (params: Record<string, unknown>) =>
    api.get('drawing/mj/admin/jobs', { params }),
};
