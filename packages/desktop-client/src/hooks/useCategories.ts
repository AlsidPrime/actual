import { groupById } from '@actual-app/core/shared/util';
import { useQuery } from '@tanstack/react-query';

import { categoryQueries } from '#budget';

export function useCategories(enabled = true) {
  return useQuery({ ...categoryQueries.list(), enabled });
}

export function useCategoriesById() {
  return useQuery({
    ...categoryQueries.list(),
    select: data => {
      return {
        list: groupById(data.list),
        grouped: groupById(data.grouped),
      };
    },
  });
}
