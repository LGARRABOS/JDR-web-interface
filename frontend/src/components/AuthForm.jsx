import React from 'react';

const AuthForm = ({ title, onSubmit, submitLabel, children }) => (
  <div className="max-w-md mx-auto mt-20 bg-slate-800/70 rounded-xl shadow-lg p-8">
    <h2 className="text-2xl font-semibold mb-6 text-center text-accent">{title}</h2>
    <form
      onSubmit={onSubmit}
      className="space-y-4"
    >
      {children}
      <button
        type="submit"
        className="w-full py-2 rounded bg-accent text-white font-medium hover:bg-violet-500"
      >
        {submitLabel}
      </button>
    </form>
  </div>
);

export default AuthForm;
