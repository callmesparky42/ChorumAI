'use client'

interface Project {
    id: string
    name: string
    description?: string
    techStack?: string[]
    customInstructions?: string
}

export function ContextPanel({ activeProject }: { activeProject: Project | null }) {
    if (!activeProject) {
        return (
            <div className="w-80 bg-gray-950 border-l border-gray-800 p-6 flex flex-col items-center justify-center text-gray-500 text-sm">
                <p>Select a project</p>
            </div>
        )
    }

    return (
        <div className="w-80 bg-gray-950 border-l border-gray-800 flex flex-col">
            <div className="p-4 border-b border-gray-800">
                <h2 className="font-medium text-white text-sm">Context & Memory</h2>
            </div>
            <div className="p-4 space-y-6">
                <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Project</h3>
                    <p className="text-sm text-gray-200 font-medium">{activeProject.name}</p>
                    {activeProject.description && (
                        <p className="text-xs text-gray-400 mt-1">{activeProject.description}</p>
                    )}
                </div>

                <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Tech Stack</h3>
                    <div className="flex flex-wrap gap-2">
                        {activeProject.techStack && activeProject.techStack.length > 0 ? (
                            activeProject.techStack.map(tech => (
                                <span key={tech} className="px-2 py-1 bg-gray-900 border border-gray-800 rounded text-xs text-gray-300">{tech}</span>
                            ))
                        ) : (
                            <span className="text-xs text-gray-600 italic">No stack defined</span>
                        )}

                    </div>
                </div>

                <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Custom Instructions</h3>
                    {activeProject.customInstructions ? (
                        <div className="text-sm text-gray-400 bg-gray-900/50 p-3 rounded-lg border border-gray-800 whitespace-pre-wrap">
                            {activeProject.customInstructions}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-600 italic">No instructions set</p>
                    )}
                </div>
            </div>
        </div>
    )
}
