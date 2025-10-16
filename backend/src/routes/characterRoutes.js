import { Router } from 'express';
import { createCharacter, listCharacters, updateCharacter } from '../controllers/characterController.js';
import { isAuthenticated } from '../middleware/auth.js';

const router = Router();

router.get('/', isAuthenticated, listCharacters);
router.post('/', isAuthenticated, createCharacter);
router.put('/:id', isAuthenticated, updateCharacter);

export default router;
