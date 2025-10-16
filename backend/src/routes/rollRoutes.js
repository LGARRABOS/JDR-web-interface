import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth.js';
import { roll } from '../controllers/rollController.js';

const router = Router();

router.post('/', isAuthenticated, roll);

export default router;
