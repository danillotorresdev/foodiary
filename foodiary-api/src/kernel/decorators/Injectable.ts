import { Registry } from '@kernel/di/Registry';
import { Constructor } from '@shared/types/Constructor';

/**
 * Decorador que marca uma classe como injetável no sistema de injeção de dependências.
 *
 * @remarks
 * Este decorador registra a classe decorada no Registry singleton, permitindo que ela
 * seja resolvida e injetada em outras classes através do sistema de DI.
 *
 * @example
 * ```typescript
 * @Injectable()
 * class UserService {
 *   // ...
 * }
 * ```
 *
 * @returns Um decorador de classe que registra o alvo no Registry
 */
export function Injectable(): ClassDecorator {
  return (target) => {
    Registry.getInstance().register(target as unknown as Constructor);
  };
}
