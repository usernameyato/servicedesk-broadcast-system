/*
// Класс валидатора данных модальных окон
*/
export class FormValidator {
    constructor() {
        this.rules = new Map();
        this.customValidators = new Map();
    }

    addRule(fieldName, validators) {
        this.rules.set(fieldName, validators);
        return this;
    }

    addCustomValidator(name, validator) {
        this.customValidators.set(name, validator);
        return this;
    }

    validate(data, excludeFields = []) {
        const errors = {};
        let isValid = true;

        for (const [fieldName, validators] of this.rules) {
            if (excludeFields.includes(fieldName)) continue;

            const value = data[fieldName];
            const fieldErrors = [];

            for (const validator of validators) {
                const result = this.runValidator(validator, value, data);
                if (result !== true) {
                    fieldErrors.push(result);
                    isValid = false;
                }
            }

            if (fieldErrors.length > 0) {
                errors[fieldName] = fieldErrors;
            }
        }

        return { isValid, errors };
    }

    runValidator(validator, value, allData) {
        if (typeof validator === 'function') {
            return validator(value, allData);
        }

        if (typeof validator === 'object') {
            const { type, message, ...options } = validator;
            
            switch (type) {
                case 'required':
                    return this.validateRequired(value) || message || 'Поле обязательно для заполнения';
                case 'minLength':
                    return this.validateMinLength(value, options.min) || message || `Минимальная длина: ${options.min}`;
                case 'maxLength':
                    return this.validateMaxLength(value, options.max) || message || `Максимальная длина: ${options.max}`;
                case 'email':
                    return this.validateEmail(value) || message || 'Некорректный email';
                case 'date':
                    return this.validateDate(value) || message || 'Некорректная дата';
                case 'custom':
                    const customValidator = this.customValidators.get(options.name);
                    return customValidator ? customValidator(value, allData) : true;
                default:
                    return true;
            }
        }

        return true;
    }

    validateRequired(value) {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim() !== '';
        if (Array.isArray(value)) return value.length > 0;
        return true;
    }

    validateMinLength(value, min) {
        if (!value) return true;
        return value.length >= min;
    }

    validateMaxLength(value, max) {
        if (!value) return true;
        return value.length <= max;
    }

    validateEmail(value) {
        if (!value) return true;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(value);
    }

    validateDate(value) {
        if (!value) return true;
        const date = new Date(value);
        return !isNaN(date.getTime());
    }
}

// Объявление правил валидации данных
export const crqValidator = new FormValidator()
    .addRule('crq_number', [
        { type: 'required' }
    ])
    .addRule('initiator_name', [
        { type: 'required' }
    ])
    .addRule('direction', [
        { type: 'required' }
    ])
    .addRule('impact', [
        { type: 'required' }
    ])
    .addRule('start_date', [
        { type: 'required' },
        { type: 'date' }
    ])
    .addRule('end_date', [
        { type: 'required' },
        { type: 'date' }
    ])
    .addRule('work_type', [
        { type: 'required' }
    ])
    .addRule('sub_names', [
        { type: 'required', message: 'Выберите хотя бы один тип рассылки' }
    ])
    .addRule('short_description', [
        { type: 'required' }
    ])
    .addRule('cause', [
        { type: 'required' }
    ])
    .addRule('impact_details', [
        { type: 'required' }
    ]);