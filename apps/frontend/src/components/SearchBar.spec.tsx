import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchBar from './SearchBar';

describe('SearchBar Component', () => {
  const mockNodes = [
    {
      id: 'src/index.ts',
      name: 'index.ts',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      type: 'file',
      size: 100,
      language: 'ts',
    },
    {
      id: 'src/components/Button.tsx',
      name: 'Button.tsx',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      type: 'file',
      size: 200,
      language: 'tsx',
    },
  ];

  it('renders the search input', () => {
    render(<SearchBar nodes={mockNodes as any} onSelectNode={jest.fn()} />);
    expect(screen.getByPlaceholderText('Search files...')).toBeInTheDocument();
  });

  it('filters results based on query', () => {
    render(<SearchBar nodes={mockNodes as any} onSelectNode={jest.fn()} />);
    const input = screen.getByPlaceholderText('Search files...');
    
    fireEvent.change(input, { target: { value: 'button' } });
    
    expect(screen.getByText('Button.tsx')).toBeInTheDocument();
    expect(screen.queryByText('index.ts')).not.toBeInTheDocument();
  });

  it('calls onSelectNode when a result is clicked', () => {
    const handleSelect = jest.fn();
    render(<SearchBar nodes={mockNodes as any} onSelectNode={handleSelect} />);
    const input = screen.getByPlaceholderText('Search files...');
    
    fireEvent.change(input, { target: { value: 'index' } });
    
    const resultItem = screen.getByText('index.ts');
    fireEvent.click(resultItem);
    
    expect(handleSelect).toHaveBeenCalledWith('src/index.ts');
  });
});
