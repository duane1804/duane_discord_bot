import { customAlphabet } from 'nanoid';

const alphabet =
  '123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/*
 *****************************************
 *
 *
 */

export function getNanoId(length = 15): string {
  const nanoid = customAlphabet(alphabet, length);
  return nanoid();
}

/*
 *****************************************
 *
 *
 */

export const getEnumKeys = (entity: any) => {
  const keys = Object.keys(entity).filter((key) => isNaN(Number(key)));
  return keys;
};

export const getEnumValues = (entity: any) => {
  const values = Object.keys(entity)
    .filter((key) => !isNaN(Number(key)))
    .map((key) => Number(key));
  return values;
};
