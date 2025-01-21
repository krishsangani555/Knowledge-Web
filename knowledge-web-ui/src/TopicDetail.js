import React, { useState, useEffect, useMemo } from 'react';

const AnnotationPopup = ({ 
  position, 
  selectedText, 
  topic, 
  isGenerating, 
  setIsGenerating, 
  explanation, 
  setExplanation,
  selectionRange
}) => {
  useEffect(() => {
    if (selectionRange) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(selectionRange);
    }
  }, [selectionRange, isGenerating]);

  const generateAnnotation = async () => {
    console.log("generateAnnotation called");
    try {
      setIsGenerating(true);
      setExplanation(null);
      
      console.log("Fetching annotation for:", selectedText);
      
      const response = await fetch('http://localhost:9000/generate-annotation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: selectedText,
          topic: topic
        }),
      });
      
      const data = await response.json();
      console.log("Received annotation:", data.annotation);
      setExplanation(data.annotation);
    } catch (error) {
      console.error('Error generating annotation:', error);
      setExplanation("Failed to generate explanation");
    } finally {
      console.log("Setting isGenerating to false");
      setIsGenerating(false);
    }
  };

  return (
    <div 
      style={{
        position: 'fixed',
        left: position.x - 140,
        top: position.y,
        backgroundColor: 'white',
        padding: '12px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        zIndex: 9999,
        animation: 'fadeIn 0.2s ease',
        width: explanation || isGenerating ? '300px' : '120px',
        maxWidth: '300px',
        transform: 'translateY(-50%)',
        maxHeight: '200px',
        overflowY: 'auto'
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {!explanation && !isGenerating && (
        <button
          className="explain-button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.preventDefault();
            generateAnnotation();
          }}
          style={{
            width: '100%',
            padding: '8px 16px',
            backgroundColor: '#E8F1F8',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            color: '#2C3E50',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s ease'
          }}
        >
          Explain This
        </button>
      )}
      
      {isGenerating && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          padding: '8px',
          width: '100%'
        }}>
          <div className="loading-spinner-small" />
          <div style={{
            color: '#4A5568',
            fontSize: '14px',
            textAlign: 'center'
          }}>
            Loading explanation...
          </div>
        </div>
      )}

      {explanation && !isGenerating && (
        <div style={{
          fontSize: '14px',
          color: '#4B5563',
          lineHeight: '1.5'
        }}>
          <div style={{
            fontSize: '14px',
            fontWeight: '500',
            marginBottom: '8px',
            color: '#92400E'
          }}>
            {selectedText}
          </div>
          {explanation}
        </div>
      )}
    </div>
  );
};

const TopicDetail = ({ topic, content, onBack, isLoading }) => {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [articleTitle, setArticleTitle] = useState(topic);
  const [articleContent, setArticleContent] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [showAnnotationPopup, setShowAnnotationPopup] = useState(false);
  const [annotationPosition, setAnnotationPosition] = useState({ x: 0, y: 0 });
  const [isGeneratingAnnotation, setIsGeneratingAnnotation] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [selectionRange, setSelectionRange] = useState(null);

  useEffect(() => {
    setImageLoading(true);
    setImageError(false);

    if (typeof content === 'object' && content !== null) {
      setArticleTitle(content.title || `About ${topic}`);
      setArticleContent(content.content || '');
    } else if (typeof content === 'string') {
      setArticleContent(content);
    } else {
      setArticleContent('');
    }
  }, [topic, content]);

  const handleImageError = () => {
    console.log("Image failed to load");
    setImageLoading(false);
    setImageError(true);
  };

  const paragraphs = useMemo(() => {
    if (!articleContent) return [];
    return articleContent
      .split('\n\n')
      .filter(p => p.trim())
      .map(p => p.trim());
  }, [articleContent]);

  const handleTextSelection = (e) => {
    e.preventDefault();
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText.length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      setSelectedText(selectedText);
      setSelectionRange(range.cloneRange());
      setAnnotationPosition({
        x: rect.left,
        y: rect.top + window.scrollY
      });
      setShowAnnotationPopup(true);
      setExplanation(null);
    } else if (!isGeneratingAnnotation) {
      setShowAnnotationPopup(false);
      setSelectionRange(null);
    }
  };

  if (isLoading) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '20px'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px'
        }}>
          <div className="loading-spinner" style={{
            width: '30px',
            height: '30px',
            border: '3px solid #E2E8F0',
            borderTop: '3px solid #4A5568',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <div style={{ color: '#4A5568' }}>Loading topic details...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: '20px',
      height: '100%',
      position: 'relative'
    }}>
      {/* Back button header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <button 
          onClick={onBack}
          style={{
            padding: '8px 16px',
            cursor: 'pointer',
            border: 'none',
            backgroundColor: '#F0F4F8',
            color: '#2C3E50',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
        >
          <span>×</span>
          Close
        </button>
      </div>

      {/* Title */}
      <h1 style={{ 
        fontSize: '2rem',
        marginBottom: '20px',
        color: '#2C3E50',
        fontWeight: '600',
        lineHeight: '1.2'
      }}>
        {articleTitle}
      </h1>

      {/* Image */}
      <div style={{ 
        marginBottom: '20px',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: '#F8FAFC',
        maxHeight: '300px'
      }}>
        {imageLoading && !imageError && (
          <div style={{
            padding: '20px',
            color: '#64748B',
            textAlign: 'center'
          }}>
            Loading image...
          </div>
        )}
        {!imageError && (
          <img 
            src={`http://localhost:9000/topic-image/${encodeURIComponent(topic)}`}
            alt={topic}
            style={{
              maxWidth: '100%',
              maxHeight: '400px',
              objectFit: 'contain',
              display: imageLoading ? 'none' : 'block'
            }}
            onLoad={() => setImageLoading(false)}
            onError={handleImageError}
          />
        )}
        {imageError && (
          <div style={{
            padding: '20px',
            color: '#64748B',
            textAlign: 'center'
          }}>
            No image available for this topic
          </div>
        )}
      </div>

      {/* Content with selection handling */}
      <div 
        onMouseUp={handleTextSelection}
        onSelect={handleTextSelection}
        style={{ 
          fontSize: '1.1rem',
          lineHeight: '1.8',
          color: '#2C3E50',
          position: 'relative',
          userSelect: 'text',
          WebkitUserSelect: 'text',
          cursor: 'text',
          minHeight: '100px'
        }}
      >
        {paragraphs.map((paragraph, index) => (
          <p 
            key={index} 
            style={{ 
              marginBottom: '1.5rem',
              textAlign: 'justify',
              padding: '15px',
              backgroundColor: index % 2 === 0 ? '#FFF' : '#F8FAFC',
              borderRadius: '8px',
              border: '1px solid #E8F1F8',
              transition: 'all 0.2s ease',
              position: 'relative',
              userSelect: 'text',
              WebkitUserSelect: 'text'
            }}
          >
            {paragraph}
          </p>
        ))}

        {/* Show only the AnnotationPopup */}
        {showAnnotationPopup && (
          <AnnotationPopup
            position={annotationPosition}
            selectedText={selectedText}
            topic={topic}
            isGenerating={isGeneratingAnnotation}
            setIsGenerating={setIsGeneratingAnnotation}
            explanation={explanation}
            setExplanation={setExplanation}
            selectionRange={selectionRange}
          />
        )}
      </div>
    </div>
  );
};

export default TopicDetail; 