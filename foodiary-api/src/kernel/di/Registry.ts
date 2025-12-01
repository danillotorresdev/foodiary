import { Constructor } from '@shared/types/Constructor';

/**
 * A singleton registry that manages dependency injection for the application.
 *
 * @remarks
 * The Registry class provides a centralized way to register and resolve class dependencies.
 * It uses reflection metadata to automatically detect constructor dependencies and creates
 * instances with their dependencies injected.
 *
 * @example
 * ```typescript
 * const registry = Registry.getInstance();
 *
 * // Register a class
 * registry.register(MyService);
 *
 * // Resolve an instance with dependencies injected
 * const service = registry.resolve(MyService);
 * ```
 */
export class Registry {
  private static instance: Registry | undefined;

  static getInstance() {
    if (!this.instance) {
      this.instance = new Registry();
    }

    return this.instance;
  }

  private constructor() {}

  private readonly providers = new Map<string, Registry.Provider>();

  register(impl: Constructor) {
    const token = impl.name;

    if (this.providers.has(token)) {
      throw new Error(`"${token}" is already registered in the registry.`);
    }

    const deps = Reflect.getMetadata('design:paramtypes', impl) ?? [];

    this.providers.set(token, { impl, deps });
  }

  resolve<TImpl extends Constructor>(impl: TImpl): InstanceType<TImpl> {
    const token = impl.name;
    const provider = this.providers.get(token);

    if (!provider) {
      throw new Error(`"${token}" is not registered.`);
    }

    const deps = provider.deps.map(dep => this.resolve(dep));
    const instance = new provider.impl(...deps);

    return instance;
  }
}

export namespace Registry {
  export type Provider = {
    impl: Constructor;
    deps: Constructor[];
  };
}
