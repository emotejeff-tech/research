import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Sparkles, Download, Code2, Zap, ShieldCheck, Database, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Plugin Store — INTELLAGENT',
  description: 'Discover and download INTELLAGENT plugins',
}

const plugins = [
  {
    name: 'Arxiv Fetcher',
    tag: 'Research',
    description: 'Fetch and summarize the latest arXiv abstracts for any research topic.',
    tags: ['arxiv', 'research', 'papers'],
    installs: '12.4k',
    rating: '4.9',
    color: 'from-cyan-400 to-blue-500',
  },
  {
    name: 'Source Crossref',
    tag: 'Validation',
    description: 'Cross-reference claims against source snippets to verify evidence quality.',
    tags: ['validation', 'claims', 'sources'],
    installs: '8.7k',
    rating: '4.8',
    color: 'from-emerald-400 to-green-500',
  },
  {
    name: 'PDF Outline',
    tag: 'Document',
    description: 'Extract structured outlines from PDF documents for rapid research.',
    tags: ['pdf', 'documents', 'outline'],
    installs: '6.2k',
    rating: '4.7',
    color: 'from-violet-400 to-purple-500',
  },
  {
    name: 'Opsec Scrubber',
    tag: 'Security',
    description: 'Scrub sensitive data from logs before external processing.',
    tags: ['security', 'privacy', 'logs'],
    installs: '5.1k',
    rating: '4.9',
    color: 'from-orange-400 to-red-500',
  },
  {
    name: 'UA Rotator',
    tag: 'Network',
    description: 'Rotate user agents and jitter delays for research workflows.',
    tags: ['network', 'ua', 'jitter'],
    installs: '4.8k',
    rating: '4.6',
    color: 'from-pink-400 to-rose-500',
  },
  {
    name: 'Dork Explorer',
    tag: 'OSINT',
    description: 'Discover publicly exposed information with advanced search operators.',
    tags: ['osint', 'search', 'discovery'],
    installs: '3.9k',
    rating: '4.5',
    color: 'from-lime-400 to-teal-500',
  },
]

export default function PluginStorePage() {
  return (
    <main className="min-h-screen bg-[#050816] text-white overflow-hidden">
      {/* Background gradients */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(0,229,255,0.25),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(168,85,247,0.25),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(34,197,94,0.15),_transparent_35%)]" />
        <div className="absolute inset-0 opacity-20">
          {[...Array(40)].map((_, i) => (
            <div
              key={i}
              className="absolute w-px h-px bg-white rounded-full animate-float"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${5 + Math.random() * 10}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Hero */}
      <section className="relative z-10 min-h-screen flex flex-col justify-center px-6 py-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-xl mb-8">
              <Sparkles className="w-4 h-4 text-cyan-300" />
              <span className="text-sm text-cyan-100">Plugin Marketplace for INTELLAGENT</span>
            </div>
            <h1 className="text-7xl md:text-9xl font-black tracking-tight mb-6">
              <span className="bg-gradient-to-r from-cyan-300 via-white to-purple-300 bg-clip-text text-transparent">
                Plugin
              </span>{' '}
              Store
            </h1>
            <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
              Discover powerful plugins that extend INTELLAGENT's capabilities. Each plugin is tested, verified, and ready to download.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
            {[
              { value: '128+', label: 'Verified Plugins' },
              { value: '99.2%', label: 'Success Rate' },
              { value: '24/7', label: 'Auto-Updates' },
            ].map((stat) => (
              <div key={stat.label} className="glass-card p-6">
                <div className="text-3xl font-bold text-white mb-2">{stat.value}</div>
                <div className="text-sm text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Plugin Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {plugins.map((plugin, index) => (
              <div
                key={plugin.name}
                className="glass-card relative overflow-hidden group transform transition-all duration-300 hover:-translate-y-2 hover:scale-[1.02]"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {/* Floating glow */}
                <div className={`absolute -inset-1 bg-gradient-to-r ${plugin.color} opacity-0 group-hover:opacity-20 blur-2xl transition-opacity duration-300`} />
                <div className="relative p-8">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <div className="text-sm font-medium text-cyan-200 mb-2">{plugin.tag}</div>
                      <h3 className="text-2xl font-bold text-white mb-3">{plugin.name}</h3>
                      <p className="text-gray-400 leading-relaxed">{plugin.description}</p>
                    </div>
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${plugin.color} flex items-center justify-center shadow-lg shadow-cyan-500/20`}>
                      <Code2 className="w-7 h-7 text-white" />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-6">
                    {plugin.tags.map((tag) => (
                      <span key={tag} className="px-3 py-1 rounded-full bg-white/10 text-xs text-gray-300 border border-white/10">
                        #{tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-white/10 pt-5">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-yellow-300">
                        ★ <span className="font-bold">{plugin.rating}</span>
                      </div>
                      <span className="text-sm text-gray-400">{plugin.installs} installs</span>
                    </div>
                    <Button
                      variant="outline"
                      className="border-cyan-400/30 bg-cyan-400/10 hover:bg-cyan-400/20 text-cyan-100"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Floating 3D cards */}
      <div className="fixed inset-0 pointer-events-none z-20">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-cyan-400/10 rounded-3xl rotate-12 blur-xl animate-float-slow" />
        <div className="absolute top-1/3 right-1/4 w-24 h-24 bg-purple-400/10 rounded-3xl -rotate-12 blur-xl animate-float-slow" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-1/4 left-1/3 w-20 h-20 bg-green-400/10 rounded-3xl rotate-6 blur-xl animate-float-slow" style={{ animationDelay: '2s' }} />
      </div>
    </main>
  )
}
