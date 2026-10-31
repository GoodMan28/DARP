/**
 * Lists whose items belong to an item of another list: a programme belongs to a level (B.Tech. to UG),
 * a specialisation to a programme (Biotechnology to M.Tech.). The same name may sit under two parents.
 */
export const LIST_PARENTS: Record<string, string> = {
  programmes: 'studentLevels',
  specialisations: 'programmes',
};
