interface Signal<Value> {
    value: Value;
}

interface ComputedSignal<Value> {
    readonly value: Value;
}

interface EffectCallback {
    (): void;
    isRunning: boolean;
    isActive: boolean;
    dependencies: SignalConstructor<unknown>[];
}

let runningEffect: EffectCallback | null = null;

class SignalConstructor<Value> implements Signal<Value>{
    protected savedValue: Value;
    private dependencies = new Set<EffectCallback>();

    constructor(initialValue: Value) {
        this.savedValue = initialValue;
    }

    get value() {
        this.addDependency();
        return this.savedValue;
    }

    private set value(newWValue: Value) {
        if (Object.is(newWValue, this.savedValue)) {
            return;
        }
        this.savedValue = newWValue;
        this.runDependency();
    }

    addDependency() {
        if(!runningEffect) {
            return;
        }

        this.dependencies.add(runningEffect);
        runningEffect.dependencies.push(this);
    };

    runDependency() {
        const dependenciesToRun  = [...this.dependencies];
        dependenciesToRun.forEach((callback) => callback());
    }

    removeDependency(effectCallback: EffectCallback) {
        this.dependencies.delete(effectCallback);
    }
}

export function signal<Value>(initialValue: Value) : Signal<Value> {
    return new SignalConstructor(initialValue);
}

export function effect(callback: VoidFunction) {
    const effectCallback: EffectCallback = () => {
        if (effectCallback.isRunning || !effectCallback.isActive) {
            return;
        }

        effectCallback.dependencies
            .forEach((signal => signal.removeDependency(effectCallback)));

        effectCallback.isRunning = true;
        const prevRunningEffect = runningEffect;
        runningEffect = effectCallback;

        try {
            callback();
        } catch (error) {
            console.error('An error happened inside of the callback');
            throw (error);
        } finally {
            runningEffect = prevRunningEffect;
            effectCallback.isRunning = false;
        }
    }
    effectCallback.dependencies = [];
    effectCallback.isRunning = false;
    effectCallback.isActive = true;

    effectCallback();

    return () => {
        effectCallback.isActive = false;
        effectCallback.dependencies
            .forEach(signal => signal.removeDependency(effectCallback));
        effectCallback.dependencies.length = 0;
    }
};

class ComputedSignalConstructor<Value> extends SignalConstructor<Value>{
    private compute: () => Value;
    private isDirty = true;
    private disposeEffect: VoidFunction | null = null;

    constructor(compute: () => Value) {
        super(undefined as unknown as Value);
        this.compute = compute;
    }

    override get value() {
        if (this.isDirty) {
            this.updateValueInEffect();
        }
        this.addDependency();
        return this.savedValue;
    }

    private updateValueInEffect() {
        this.disposeEffect = effect(() => {
            if (this.isDirty) {
                this.savedValue = this.compute();
                this.isDirty = false;
            } else {
                this.isDirty = true;
                this.disposeEffect?.();
                this.runDependency();
            }
        })
    }
}

export function computed<Value>(compute: () => Value): ComputedSignal<Value> {
    return new ComputedSignalConstructor(compute);
}
